import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import Stripe from "stripe";
import { fileTypeFromBuffer } from "file-type";
import User from "../models/user.model.js";
import {
  AuditLog,
  CatalogProduct,
  Category,
  Payment,
  Settings,
  StoreOrder,
} from "./models.js";
import {
  audit,
  cartView,
  couponRate,
  createCheckout,
  getSettings,
  markOrderFailed,
  markOrderPaid,
  presentOrder,
  presentProduct,
  priceLines,
  publicUser,
  queryProducts,
  randomToken,
  releaseOrderStock,
  requireAdmin,
  requireUser,
  resolveLines,
  sha256,
  signUser,
  upsertCart,
} from "./commerce.js";
import { isLive } from "./env.js";

const router = express.Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { message: "Too many attempts. Try again later." },
});

function fail(res, err) {
  if (err?.name === "CastError") return res.status(400).json({ message: "Invalid id." });
  const status = err.status || 500;
  const message = status >= 500 ? "Something went wrong." : err.message;
  if (status >= 500) console.error(err);
  return res.status(status).json({ message });
}

function devToken(token) {
  return isLive() ? undefined : token;
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/auth/register", authLimit, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || String(name).trim().length < 3 || String(name).trim().length > 30) {
      return res.status(400).json({ message: "Enter your name (3–30 characters)." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email || "")) {
      return res.status(400).json({ message: "Enter a valid email." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) return res.status(409).json({ message: "An account with this email already exists." });
    const token = randomToken();
    const user = await User.create({
      name: String(name).trim().slice(0, 60),
      email: String(email).toLowerCase(),
      password,
      role: "customer",
      isEmailVerified: false,
      emailVerifyTokenHash: sha256(token),
    });
    res.status(201).json({
      message: "Account created. Verify your email to sign in.",
      devToken: devToken(token),
      email: user.email,
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/verify-email", authLimit, async (req, res) => {
  try {
    const token = req.body?.token;
    if (!token) return res.status(400).json({ message: "Enter the verification code." });
    const user = await User.findOne({ emailVerifyTokenHash: sha256(token) }).select(
      "+emailVerifyTokenHash",
    );
    if (!user) return res.status(400).json({ message: "That code is incorrect." });
    user.isEmailVerified = true;
    user.emailVerifyTokenHash = undefined;
    await user.save();
    res.json({ user: publicUser(user), token: signUser(user) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/login", authLimit, async (req, res) => {
  try {
    const email = String(req.body?.email || "").toLowerCase();
    const password = req.body?.password || "";
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (user.disabled) return res.status(403).json({ message: "This account is disabled." });
    if (!user.isEmailVerified) {
      return res.status(403).json({ message: "Verify your email to sign in." });
    }
    res.json({ user: publicUser(user), token: signUser(user) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/forgot-password", authLimit, async (req, res) => {
  try {
    const email = String(req.body?.email || "").toLowerCase();
    const user = await User.findOne({ email }).select("+resetTokenHash");
    const token = randomToken();
    if (user && !user.disabled) {
      user.resetTokenHash = sha256(token);
      user.resetExpires = new Date(Date.now() + 1000 * 60 * 30);
      await user.save();
    }
    res.json({
      message: "If an account exists, a reset code is ready.",
      devToken: user && !isLive() ? token : undefined,
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/reset-password", authLimit, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    const user = await User.findOne({
      resetTokenHash: sha256(token || ""),
      resetExpires: { $gt: new Date() },
    }).select("+resetTokenHash +password");
    if (!user) return res.status(400).json({ message: "That reset code is invalid or expired." });
    user.password = password;
    user.resetTokenHash = undefined;
    user.resetExpires = undefined;
    await user.save();
    res.json({ message: "Password updated." });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/auth/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.storeUser) });
});

router.patch("/auth/me", requireUser, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (name.length < 3 || name.length > 30) {
      return res.status(400).json({ message: "Enter your name (3–30 characters)." });
    }
    req.storeUser.name = name;
    await req.storeUser.save();
    res.json({ user: publicUser(req.storeUser) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/change-password", requireUser, async (req, res) => {
  try {
    const current = req.body?.current || "";
    const password = req.body?.password || "";
    if (String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    const user = await User.findById(req.storeUser._id).select("+password");
    if (!user || !(await user.comparePassword(current))) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }
    user.password = password;
    await user.save();
    res.json({ message: "Password updated." });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("storeToken");
  res.json({ ok: true });
});

router.get("/products", async (req, res) => {
  try {
    res.json(await queryProducts(req.query));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/products/:slug", async (req, res) => {
  try {
    const product = await CatalogProduct.findOne({ slug: req.params.slug, status: "active" });
    if (!product) return res.status(404).json({ message: "Piece not found." });
    const related = await CatalogProduct.find({
      status: "active",
      category: product.category,
      _id: { $ne: product._id },
    }).limit(4);
    res.json({ product: presentProduct(product), related: related.map(presentProduct) });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/categories", async (_req, res) => {
  const rows = await Category.find({ enabled: true }).sort({ sort: 1, name: 1 });
  res.json({ categories: rows });
});

router.post("/cart/quote", async (req, res) => {
  try {
    const lines = await resolveLines(req.body?.items || []);
    const priced = await priceLines(lines, {
      code: req.body?.code,
      shippingMethod: req.body?.shippingMethod,
    });
    res.json({
      subtotal: priced.subtotal,
      discountAmount: priced.discountAmount,
      shippingAmount: priced.shippingAmount,
      taxAmount: priced.taxAmount,
      total: priced.total,
      currency: "USD",
    });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/cart", requireUser, async (req, res) => {
  res.json({ items: await cartView(req.storeUser._id) });
});

router.put("/cart", requireUser, async (req, res) => {
  try {
    await upsertCart(req.storeUser._id, req.body?.items || []);
    res.json({ items: await cartView(req.storeUser._id) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/checkout", requireUser, async (req, res) => {
  try {
    const result = await createCheckout({
      user: req.storeUser,
      items: req.body?.items,
      address: req.body?.address,
      shippingMethod: req.body?.shippingMethod,
      code: req.body?.code,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
    });
    res.status(201).json({
      order: presentOrder(result.order),
      url: result.url,
      devPayment: Boolean(result.devPayment),
      reused: Boolean(result.reused),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/checkout/:orderNumber/simulate", requireUser, async (req, res) => {
  try {
    if (process.env.STRIPE_SECRET_KEY || isLive()) {
      return res.status(404).json({ message: "Not available." });
    }
    const order = await StoreOrder.findOne({
      orderNumber: req.params.orderNumber,
      user: req.storeUser._id,
    });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (req.body?.result === "failed") {
      await markOrderFailed(order);
    } else {
      await markOrderPaid(order, { provider: "dev", providerRef: "dev" });
    }
    const fresh = await StoreOrder.findById(order._id);
    res.json({ order: presentOrder(fresh) });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/orders", requireUser, async (req, res) => {
  const rows = await StoreOrder.find({ user: req.storeUser._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ orders: rows.map(presentOrder) });
});

router.get("/orders/:orderNumber", requireUser, async (req, res) => {
  const order = await StoreOrder.findOne({
    orderNumber: req.params.orderNumber,
    user: req.storeUser._id,
  });
  if (!order) return res.status(404).json({ message: "Order not found." });
  res.json({ order: presentOrder(order) });
});

router.get("/sitemap.xml", async (req, res) => {
  const products = await CatalogProduct.find({ status: "active" }).select("slug updatedAt");
  const origin = process.env.CLIENT_URL || "http://127.0.0.1:5173";
  const urls = ["/", "/shop", "/new", "/sale", ...products.map((p) => `/product/${p.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${origin}${u}</loc></url>`)
    .join("\n")}\n</urlset>`;
  res.type("application/xml").send(body);
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get("/stats", async (_req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
    const since = new Date(Date.now() - 14 * 86400000);
    const [orderAgg, customers, newCustomers, products, active, recentOrders, recentCustomerDocs, revenueByDay, top, categorySales] =
      await Promise.all([
        StoreOrder.aggregate([
          {
            $group: {
              _id: null,
              revenue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } },
              todayRevenue: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$paymentStatus", "paid"] }, { $gte: ["$createdAt", startOfDay] }] },
                    "$total",
                    0,
                  ],
                },
              },
              monthRevenue: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$paymentStatus", "paid"] }, { $gte: ["$createdAt", startOfMonth] }] },
                    "$total",
                    0,
                  ],
                },
              },
              totalOrders: { $sum: 1 },
              pendingOrders: {
                $sum: { $cond: [{ $in: ["$status", ["pending", "confirmed", "processing"]] }, 1, 0] },
              },
              completedOrders: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
              cancelledOrders: {
                $sum: { $cond: [{ $in: ["$status", ["cancelled", "refunded"]] }, 1, 0] },
              },
            },
          },
        ]),
        User.countDocuments({ role: "customer" }),
        User.countDocuments({ role: "customer", createdAt: { $gte: startOfMonth } }),
        CatalogProduct.countDocuments({ status: { $ne: "archived" } }),
        CatalogProduct.find({ status: "active" }).select("category variants lowStockThreshold"),
        StoreOrder.find().sort({ createdAt: -1 }).limit(6),
        User.find({ role: "customer" }).sort({ createdAt: -1 }).limit(6),
        StoreOrder.aggregate([
          { $match: { paymentStatus: "paid", createdAt: { $gte: since } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              total: { $sum: "$total" },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        StoreOrder.aggregate([
          { $match: { paymentStatus: "paid" } },
          { $unwind: "$items" },
          { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" } } },
          { $sort: { quantity: -1 } },
          { $limit: 5 },
        ]),
        StoreOrder.aggregate([
          { $match: { paymentStatus: "paid" } },
          { $unwind: "$items" },
          { $group: { _id: "$items.category", total: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] } } } },
          { $sort: { total: -1 } },
        ]),
      ]);
    const low = active.filter((p) => p.variants.some((v) => v.stock <= (p.lowStockThreshold ?? 5)));
    const totals = orderAgg[0] || {
      revenue: 0,
      todayRevenue: 0,
      monthRevenue: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
    };
    delete totals._id;
    const sales = categorySales.filter((c) => c._id);
    const categories = sales.length
      ? sales.map((c) => ({ name: c._id, revenue: c.total }))
      : Object.entries(
          active.reduce((map, p) => {
            map[p.category] = (map[p.category] || 0) + 1;
            return map;
          }, {}),
        ).map(([name, count]) => ({ name, count }));
    res.json({
      ...totals,
      customers,
      newCustomers,
      products,
      lowStock: low.length,
      revenueSeries: revenueByDay.map((d) => ({ date: d._id, total: d.total, orders: d.orders })),
      topProducts: top.map((t) => ({ name: t._id, quantity: t.quantity })),
      categories,
      recentOrders: recentOrders.map(presentOrder),
      recentCustomers: recentCustomerDocs.map(publicUser),
    });
  } catch (err) {
    fail(res, err);
  }
});

admin.get("/products", async (req, res) => {
  res.json(await queryProducts({ ...req.query, limit: req.query.limit || "20" }, { includeHidden: true }));
});

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeProduct(body, existing) {
  const price = Number(body.price);
  if (!body.name || !body.description || !body.category || Number.isNaN(price)) {
    throw Object.assign(new Error("Name, description, category, and price are required."), {
      status: 400,
    });
  }
  const variants = Array.isArray(body.variants) && body.variants.length
    ? body.variants.map((v) => ({
        sku: String(v.sku || `${slugify(body.name)}-${v.size}-${v.color}`).toUpperCase(),
        size: v.size || "",
        color: v.color || "",
        colorHex: v.colorHex || "#111111",
        price: v.price == null || v.price === "" ? price : Number(v.price),
        stock: Math.max(0, Number(v.stock) || 0),
      }))
    : [
        {
          sku: `${slugify(body.name)}-OS`.toUpperCase(),
          size: "One Size",
          color: "Default",
          colorHex: "#111111",
          price,
          stock: Math.max(0, Number(body.stock) || 0),
        },
      ];
  const images = (body.images || existing?.images || []).map((img) =>
    typeof img === "string" ? { url: img, alt: body.name } : { url: img.url, alt: img.alt || body.name },
  );
  return {
    name: String(body.name).trim(),
    slug: slugify(body.slug || body.name),
    description: String(body.description),
    shortDescription: body.shortDescription || String(body.description).slice(0, 160),
    category: body.category,
    subcategory: body.subcategory || body.collection || "",
    brand: body.brand || "Fluxo",
    price,
    compareAt: body.compareAt ? Number(body.compareAt) : undefined,
    images,
    thumbnail: images[0]?.url,
    variants,
    tags: body.tags || [],
    status: body.status || "active",
    featured: Boolean(body.featured),
    newArrival: Boolean(body.isNew),
    onSale: Boolean(body.onSale) || Boolean(body.compareAt),
    lowStockThreshold: Number(body.lowStockThreshold ?? 5),
    details: body.details || [],
    materials: body.materials || "",
    care: body.care || "",
  };
}

admin.post("/products", async (req, res) => {
  try {
    const created = await CatalogProduct.create(normalizeProduct(req.body));
    await audit(req.storeUser, "product.created", "product", created._id, { name: created.name });
    res.status(201).json({ product: presentProduct(created) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Slug or SKU already exists." });
    fail(res, err);
  }
});

admin.patch("/products/:id", async (req, res) => {
  try {
    const existing = await CatalogProduct.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Product not found." });
    const previousPrice = existing.price;
    Object.assign(existing, normalizeProduct({ ...existing.toObject(), ...req.body }, existing));
    await existing.save();
    await audit(req.storeUser, "product.updated", "product", existing._id, {
      priceChanged: previousPrice !== existing.price,
    });
    res.json({ product: presentProduct(existing) });
  } catch (err) {
    fail(res, err);
  }
});

admin.delete("/products/:id", async (req, res) => {
  const product = await CatalogProduct.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found." });
  await audit(req.storeUser, "product.deleted", "product", product._id, { name: product.name });
  res.json({ ok: true });
});

admin.post("/products/:id/archive", async (req, res) => {
  const product = await CatalogProduct.findByIdAndUpdate(
    req.params.id,
    { status: "archived" },
    { returnDocument: "after" },
  );
  if (!product) return res.status(404).json({ message: "Product not found." });
  await audit(req.storeUser, "product.archived", "product", product._id);
  res.json({ product: presentProduct(product) });
});

admin.post("/products/:id/restore", async (req, res) => {
  const product = await CatalogProduct.findByIdAndUpdate(
    req.params.id,
    { status: "active" },
    { returnDocument: "after" },
  );
  if (!product) return res.status(404).json({ message: "Product not found." });
  await audit(req.storeUser, "product.restored", "product", product._id);
  res.json({ product: presentProduct(product) });
});

admin.post("/products/bulk", async (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: "Choose products." });
  const status = action === "restore" ? "active" : action === "archive" ? "archived" : null;
  if (!status) return res.status(400).json({ message: "Unknown bulk action." });
  await CatalogProduct.updateMany({ _id: { $in: ids } }, { status });
  await audit(req.storeUser, `product.bulk_${action}`, "product", ids.join(","));
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 6 },
});

admin.post("/uploads", upload.array("images", 6), async (req, res) => {
  try {
    const dir = path.join(process.cwd(), "uploads", "products");
    fs.mkdirSync(dir, { recursive: true });
    const urls = [];
    for (const file of req.files || []) {
      const kind = await fileTypeFromBuffer(file.buffer);
      if (!kind || !["image/jpeg", "image/png", "image/webp"].includes(kind.mime)) {
        return res.status(400).json({ message: "Only JPEG, PNG, and WebP images are allowed." });
      }
      const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${kind.ext}`;
      fs.writeFileSync(path.join(dir, name), file.buffer);
      urls.push(`/uploads/products/${name}`);
    }
    res.status(201).json({ urls });
  } catch (err) {
    fail(res, err);
  }
});

admin.get("/orders", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
  const limit = 20;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.payment) filter.paymentStatus = req.query.payment;
  if (req.query.q) filter.orderNumber = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [rows, total] = await Promise.all([
    StoreOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    StoreOrder.countDocuments(filter),
  ]);
  res.json({ orders: rows.map(presentOrder), total, page, limit });
});

const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

admin.patch("/orders/:id/status", async (req, res) => {
  try {
    const order = await StoreOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    const next = req.body?.status;
    const allowed = transitions[order.status] || [];
    if (!allowed.includes(next)) {
      return res.status(400).json({ message: `Cannot move an order from ${order.status} to ${next}.` });
    }
    if ((next === "cancelled" || next === "refunded") && order.paymentStatus === "paid" && next === "cancelled") {
      return res.status(400).json({ message: "Refund a paid order instead of cancelling it." });
    }
    if (next === "cancelled" && order.paymentStatus === "pending") await releaseOrderStock(order);
    if (next === "refunded") {
      if (order.stripePaymentIntentId && process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.refunds.create(
          { payment_intent: order.stripePaymentIntentId },
          { idempotencyKey: `refund-${order.orderNumber}` },
        );
      }
      if (order.paymentStatus === "paid") await releaseOrderStock(order);
      order.paymentStatus = "refunded";
      await Payment.findOneAndUpdate({ order: order._id }, { status: "refunded" });
    }
    order.status = next;
    await order.save();
    await audit(req.storeUser, "order.status", "order", order._id, { status: next });
    res.json({ order: presentOrder(order) });
  } catch (err) {
    fail(res, err);
  }
});

admin.get("/customers", async (req, res) => {
  const q = req.query.q ? new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const filter = { role: "customer", ...(q ? { $or: [{ email: q }, { name: q }] } : {}) };
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(50);
  const withSpend = [];
  for (const user of users) {
    const orders = await StoreOrder.find({ user: user._id, paymentStatus: "paid" });
    withSpend.push({
      ...publicUser(user),
      orders: orders.length,
      spend: orders.reduce((n, o) => n + o.total, 0),
    });
  }
  res.json({ customers: withSpend });
});

admin.get("/customers/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role === "admin") return res.status(404).json({ message: "Customer not found." });
  const orders = await StoreOrder.find({ user: user._id }).sort({ createdAt: -1 });
  res.json({
    customer: publicUser(user),
    orders: orders.map(presentOrder),
    spend: orders.filter((o) => o.paymentStatus === "paid").reduce((n, o) => n + o.total, 0),
  });
});

admin.patch("/customers/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "customer") return res.status(404).json({ message: "Customer not found." });
  user.disabled = Boolean(req.body?.disabled);
  await user.save();
  await audit(req.storeUser, user.disabled ? "user.disabled" : "user.enabled", "user", user._id);
  res.json({ customer: publicUser(user) });
});

admin.get("/categories", async (_req, res) => {
  const rows = await Category.find().sort({ sort: 1, name: 1 });
  res.json({ categories: rows });
});

admin.post("/categories", async (req, res) => {
  try {
    const row = await Category.create({
      name: req.body.name,
      slug: slugify(req.body.slug || req.body.name),
      enabled: req.body.enabled !== false,
      sort: Number(req.body.sort) || 0,
    });
    await audit(req.storeUser, "category.created", "category", row._id);
    res.status(201).json({ category: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Category already exists." });
    fail(res, err);
  }
});

admin.patch("/categories/:id", async (req, res) => {
  const row = await Category.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Category not found." });
  if (req.body.name) row.name = req.body.name;
  if (req.body.slug) row.slug = slugify(req.body.slug);
  if (typeof req.body.enabled === "boolean") row.enabled = req.body.enabled;
  if (req.body.sort != null) row.sort = Number(req.body.sort);
  await row.save();
  await audit(req.storeUser, "category.updated", "category", row._id);
  res.json({ category: row });
});

admin.delete("/categories/:id", async (req, res) => {
  const row = await Category.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ message: "Category not found." });
  await audit(req.storeUser, "category.deleted", "category", row._id);
  res.json({ ok: true });
});

admin.get("/inventory", async (_req, res) => {
  const products = await CatalogProduct.find({ status: { $ne: "archived" } });
  const pending = await StoreOrder.find({ paymentStatus: "pending", status: { $ne: "cancelled" } });
  const held = {};
  for (const order of pending) {
    for (const item of order.items) held[item.sku] = (held[item.sku] || 0) + item.quantity;
  }
  const rows = [];
  for (const product of products) {
    for (const variant of product.variants) {
      rows.push({
        productId: String(product._id),
        product: product.name,
        variant: `${variant.color || "—"} / ${variant.size || "—"}`,
        sku: variant.sku,
        stock: variant.stock,
        held: held[variant.sku] || 0,
        low: variant.stock <= (product.lowStockThreshold ?? 5),
        threshold: product.lowStockThreshold ?? 5,
      });
    }
  }
  res.json({ inventory: rows });
});

admin.patch("/inventory", async (req, res) => {
  const { productId, sku, stock } = req.body || {};
  const qty = Number(stock);
  if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ message: "Stock must be a whole number." });
  const product = await CatalogProduct.findOne({ _id: productId, "variants.sku": sku });
  if (!product) return res.status(404).json({ message: "Variant not found." });
  const variant = product.variants.find((v) => v.sku === sku);
  variant.stock = qty;
  await product.save();
  await audit(req.storeUser, "stock.updated", "variant", sku, { stock: qty });
  res.json({ ok: true });
});

admin.get("/payments", async (_req, res) => {
  const rows = await Payment.find().sort({ createdAt: -1 }).limit(100);
  res.json({
    payments: rows,
    summary: {
      succeeded: rows.filter((p) => p.status === "succeeded").length,
      failed: rows.filter((p) => p.status === "failed").length,
      pending: rows.filter((p) => p.status === "pending").length,
      refunded: rows.filter((p) => p.status === "refunded").length,
    },
  });
});

admin.get("/settings", async (_req, res) => {
  const settings = await getSettings();
  res.json({ settings });
});

admin.put("/settings", async (req, res) => {
  const settings = await getSettings();
  const fields = [
    "storeName",
    "currency",
    "supportEmail",
    "taxRate",
    "freeShippingOver",
    "standardShipping",
    "expressShipping",
    "notifyOrders",
    "coupons",
  ];
  for (const field of fields) {
    if (req.body?.[field] !== undefined) settings[field] = req.body[field];
  }
  await settings.save();
  await audit(req.storeUser, "settings.updated", "settings", settings._id);
  res.json({ settings });
});

admin.get("/audit", async (_req, res) => {
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
  res.json({ audit: rows });
});

router.use("/admin", admin);

export async function stripeWebhook(req, res) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !process.env.STRIPE_SECRET_KEY) {
      return res.status(400).json({ message: "Stripe webhook is not configured." });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      secret,
    );
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const order = await StoreOrder.findOne({
        $or: [{ stripeSessionId: session.id }, { orderNumber: session.metadata?.orderNumber }],
      });
      if (order && session.payment_status === "paid") {
        await markOrderPaid(order, { providerRef: session.payment_intent, provider: "stripe" });
      }
    }
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const order = await StoreOrder.findOne({ stripeSessionId: session.id });
      if (order && order.paymentStatus === "pending") await markOrderFailed(order);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ message: "Invalid webhook signature." });
  }
}

export { couponRate };
export default router;
