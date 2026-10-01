import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import Stripe from "stripe";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";
process.env.SEED = "0";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

let mongo;
let app;
let CatalogProduct;

const address = {
  name: "Ada Lovelace",
  line1: "12 Atelier Lane",
  city: "Paris",
  postal: "75001",
  phone: "5550100",
};

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: app } = await import("../src/app.js"));
  ({ CatalogProduct } = await import("../src/store/models.js"));
  process.env.SEED = "";
  const { seedIfEmpty } = await import("../src/store/seed.js");
  await seedIfEmpty();
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function customer() {
  const email = `ada${Date.now()}@fluxo.test`;
  const password = "password1";
  const registered = await request(app)
    .post("/api/store/auth/register")
    .send({ name: "Ada Lovelace", email, password });
  assert.equal(registered.status, 201);
  assert.ok(registered.body.devToken);
  const verified = await request(app)
    .post("/api/store/auth/verify-email")
    .send({ token: registered.body.devToken });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.role, "customer");
  assert.equal(verified.body.user.password, undefined);
  return { email, password, token: verified.body.token, user: verified.body.user };
}

test("health and catalog search stay on the server", async () => {
  const health = await request(app).get("/api/store/health");
  assert.equal(health.status, 200);
  const list = await request(app).get("/api/store/products").query({ q: "wool", category: "Women", limit: 4 });
  assert.equal(list.status, 200);
  assert.ok(list.body.total >= 1);
  assert.ok(list.body.products.every((p) => /wool/i.test(`${p.name} ${p.description}`)));
  assert.ok(list.body.products.length <= 4);
  const one = await request(app).get("/api/store/products/atelier-wool-coat");
  assert.equal(one.status, 200);
  assert.equal(one.body.product.price, 890);
  assert.ok(one.body.product.skus["M|Camel"].sku);
});

test("quote ignores client prices and rejects bad coupons", async () => {
  const product = await CatalogProduct.findOne({ slug: "atelier-wool-coat" });
  const sku = product.variants[0].sku;
  const quote = await request(app).post("/api/store/cart/quote").send({
    items: [{ productId: product._id.toString(), sku, quantity: 1, price: 1 }],
    shippingMethod: "standard",
    code: "FLUXO10",
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.subtotal, 890);
  assert.equal(quote.body.discountAmount, 89);
  const bad = await request(app).post("/api/store/cart/quote").send({
    items: [{ productId: product._id.toString(), sku, quantity: 1 }],
    code: "FREEALL",
  });
  assert.equal(bad.status, 400);
});

test("customers cannot use admin APIs", async () => {
  const user = await customer();
  const denied = await request(app).get("/api/store/admin/stats").set("Authorization", `Bearer ${user.token}`);
  assert.equal(denied.status, 403);
  const anon = await request(app).get("/api/store/admin/products");
  assert.equal(anon.status, 401);
});

test("checkout holds stock, ignores spoofed totals, and is idempotent", async () => {
  const user = await customer();
  const product = await CatalogProduct.findOne({ slug: "atelier-wool-coat" });
  const variant = product.variants.find((v) => v.size === "M" && v.color === "Camel");
  const before = variant.stock;
  const over = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${user.token}`)
    .send({
      items: [{ productId: product._id.toString(), sku: variant.sku, quantity: 9, price: 1 }],
      address,
      shippingMethod: "standard",
    });
  assert.equal(over.status, 409);

  const key = `idem-${user.user.id}`;
  const first = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${user.token}`)
    .set("Idempotency-Key", key)
    .send({
      items: [{ productId: product._id.toString(), sku: variant.sku, quantity: 1, price: 1 }],
      address,
      shippingMethod: "express",
    });
  assert.equal(first.status, 201);
  assert.equal(first.body.devPayment, true);
  assert.equal(first.body.order.total, 890 + 25);
  assert.notEqual(first.body.order.total, 1);

  const again = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${user.token}`)
    .set("Idempotency-Key", key)
    .send({
      items: [{ productId: product._id.toString(), sku: variant.sku, quantity: 1 }],
      address,
    });
  assert.equal(again.status, 201);
  assert.equal(again.body.reused, true);
  assert.equal(again.body.order.orderNumber, first.body.order.orderNumber);

  const paid = await request(app)
    .post(`/api/store/checkout/${first.body.order.orderNumber}/simulate`)
    .set("Authorization", `Bearer ${user.token}`)
    .send({ result: "paid" });
  assert.equal(paid.body.order.paymentStatus, "paid");
  assert.equal(paid.body.order.status, "confirmed");
  const twice = await request(app)
    .post(`/api/store/checkout/${first.body.order.orderNumber}/simulate`)
    .set("Authorization", `Bearer ${user.token}`)
    .send({ result: "paid" });
  assert.equal(twice.body.order.paymentStatus, "paid");

  const fresh = await CatalogProduct.findById(product._id);
  const left = fresh.variants.find((v) => v.sku === variant.sku);
  assert.equal(left.stock, before - 1);

  const other = await customer();
  const blocked = await request(app)
    .get(`/api/store/orders/${first.body.order.orderNumber}`)
    .set("Authorization", `Bearer ${other.token}`);
  assert.equal(blocked.status, 404);
});

test("failed payment restores stock and a bad webhook is rejected", async () => {
  const user = await customer();
  const product = await CatalogProduct.findOne({ slug: "silk-column-dress" });
  const variant = product.variants[0];
  const before = variant.stock;
  const order = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${user.token}`)
    .send({
      items: [{ productId: product._id.toString(), sku: variant.sku, quantity: 1 }],
      address,
    });
  assert.equal(order.status, 201);
  const failed = await request(app)
    .post(`/api/store/checkout/${order.body.order.orderNumber}/simulate`)
    .set("Authorization", `Bearer ${user.token}`)
    .send({ result: "failed" });
  assert.equal(failed.body.order.paymentStatus, "failed");
  const fresh = await CatalogProduct.findById(product._id);
  assert.equal(fresh.variants.find((v) => v.sku === variant.sku).stock, before);

  const badHook = await request(app)
    .post("/api/store/webhooks/stripe")
    .set("Content-Type", "application/json")
    .send({ type: "checkout.session.completed" });
  assert.equal(badHook.status, 400);
});

test("a signed webhook marks the matching order paid once", async () => {
  const user = await customer();
  const product = await CatalogProduct.findOne({ slug: "cashmere-knit" });
  const variant = product.variants[0];
  const order = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${user.token}`)
    .send({
      items: [{ productId: product._id.toString(), sku: variant.sku, quantity: 1 }],
      address,
    });
  assert.equal(order.body.order.paymentStatus, "pending");

  process.env.STRIPE_SECRET_KEY = "sk_test_fluxo";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fluxo";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test",
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_test",
        metadata: { orderNumber: order.body.order.orderNumber },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const hook = await request(app)
    .post("/api/store/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
  assert.equal(hook.status, 200);

  const replay = await request(app)
    .post("/api/store/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
  assert.equal(replay.status, 200);

  const view = await request(app)
    .get(`/api/store/orders/${order.body.order.orderNumber}`)
    .set("Authorization", `Bearer ${user.token}`);
  assert.equal(view.body.order.paymentStatus, "paid");
  assert.equal(view.body.order.status, "confirmed");

  const hidden = await request(app)
    .post(`/api/store/checkout/${order.body.order.orderNumber}/simulate`)
    .set("Authorization", `Bearer ${user.token}`)
    .send({});
  assert.equal(hidden.status, 404);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

test("admin manages catalog, orders, and customers", async () => {
  const login = await request(app)
    .post("/api/store/auth/login")
    .send({ email: "admin@fluxo.test", password: "FluxoAdmin!234" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "admin");
  const token = login.body.token;

  const stats = await request(app).get("/api/store/admin/stats").set("Authorization", `Bearer ${token}`);
  assert.equal(stats.status, 200);
  assert.equal(stats.body.products, 12);
  assert.ok(stats.body.revenue >= 890);

  const created = await request(app)
    .post("/api/store/admin/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Test Linen Shirt",
      description: "A light shirt for the test suite.",
      category: "Men",
      price: 120,
      variants: [{ sku: "TEST-LINEN-M", size: "M", color: "White", colorHex: "#fff", stock: 4 }],
    });
  assert.equal(created.status, 201);
  const id = created.body.product.id;

  const archived = await request(app)
    .post(`/api/store/admin/products/${id}/archive`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(archived.body.product.status, "archived");
  const hidden = await request(app).get("/api/store/products/test-linen-shirt");
  assert.equal(hidden.status, 404);
  const restored = await request(app)
    .post(`/api/store/admin/products/${id}/restore`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(restored.body.product.status, "active");

  const buyer = await customer();
  const shirt = await CatalogProduct.findById(id);
  const placed = await request(app)
    .post("/api/store/checkout")
    .set("Authorization", `Bearer ${buyer.token}`)
    .send({
      items: [{ productId: id, sku: shirt.variants[0].sku, quantity: 1 }],
      address,
    });
  await request(app)
    .post(`/api/store/checkout/${placed.body.order.orderNumber}/simulate`)
    .set("Authorization", `Bearer ${buyer.token}`)
    .send({ result: "paid" });
  const orders = await request(app).get("/api/store/admin/orders").set("Authorization", `Bearer ${token}`);
  const row = orders.body.orders.find((o) => o.orderNumber === placed.body.order.orderNumber);
  const moved = await request(app)
    .patch(`/api/store/admin/orders/${row.id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "processing" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.order.status, "processing");
  const illegal = await request(app)
    .patch(`/api/store/admin/orders/${row.id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "delivered" });
  assert.equal(illegal.status, 400);

  const off = await request(app)
    .patch(`/api/store/admin/customers/${buyer.user.id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ disabled: true });
  assert.equal(off.body.customer.disabled, true);
  const locked = await request(app)
    .post("/api/store/auth/login")
    .send({ email: buyer.email, password: buyer.password });
  assert.equal(locked.status, 403);

  const audit = await request(app).get("/api/store/admin/audit").set("Authorization", `Bearer ${token}`);
  assert.ok(audit.body.audit.some((a) => a.action === "order.status"));
  assert.ok(!JSON.stringify(audit.body).includes("password"));

  await request(app).delete(`/api/store/admin/products/${id}`).set("Authorization", `Bearer ${token}`);
});

test("password reset rotates the secret and cart sync validates stock", async () => {
  const user = await customer();
  const forgot = await request(app).post("/api/store/auth/forgot-password").send({ email: user.email });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.body.devToken);
  const reset = await request(app)
    .post("/api/store/auth/reset-password")
    .send({ token: forgot.body.devToken, password: "newpassword1" });
  assert.equal(reset.status, 200);
  const oldLogin = await request(app).post("/api/store/auth/login").send({ email: user.email, password: user.password });
  assert.equal(oldLogin.status, 401);
  const next = await request(app).post("/api/store/auth/login").send({ email: user.email, password: "newpassword1" });
  assert.equal(next.status, 200);

  const product = await CatalogProduct.findOne({ slug: "leather-tote" });
  const saved = await request(app)
    .put("/api/store/cart")
    .set("Authorization", `Bearer ${next.body.token}`)
    .send({ items: [{ productId: product._id.toString(), sku: product.variants[0].sku, quantity: 2, price: 5 }] });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.items[0].unitPrice, product.price);
  assert.equal(saved.body.items[0].quantity, 2);
});
