import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import User from "../models/user.model.js";
import { isLive } from "./env.js";
import {
  AuditLog,
  CatalogProduct,
  Category,
  Payment,
  Settings,
  StoreCart,
  StoreOrder,
} from "./models.js";

const DEV_JWT = "fluxo-dev-only-jwt-secret";

export function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isLive()) {
    throw new Error("JWT_SECRET is required");
  }
  return DEV_JWT;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function signUser(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role || "customer",
      type: "store",
    },
    jwtSecret(),
    { expiresIn: "7d", algorithm: "HS256" },
  );
}

export function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role || "customer",
    isEmailVerified: Boolean(user.isEmailVerified),
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
  };
}

export function presentProduct(doc) {
  const p = doc.toObject ? doc.toObject() : doc;
  const variants = p.variants || [];
  const sizes = [];
  const colors = [];
  const skus = {};
  for (const v of variants) {
    if (v.size && !sizes.includes(v.size)) sizes.push(v.size);
    if (v.color && !colors.some((c) => c.name === v.color)) {
      colors.push({ name: v.color, hex: v.colorHex || "#111111" });
    }
    skus[`${v.size}|${v.color}`] = {
      sku: v.sku,
      stock: v.stock,
      price: v.price ?? p.price,
    };
  }
  return {
    id: String(p._id),
    slug: p.slug,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory || "",
    collection: p.subcategory || p.category,
    brand: p.brand || "Fluxo",
    price: p.price,
    compareAt: p.compareAt || undefined,
    description: p.description,
    shortDescription: p.shortDescription || String(p.description || "").slice(0, 160),
    images: (p.images || []).map((i) => i.url),
    thumbnail: p.thumbnail || p.images?.[0]?.url || "",
    colors,
    sizes,
    skus,
    details: p.details || [],
    materials: p.materials || "",
    care: p.care || "",
    isNew: Boolean(p.newArrival),
    onSale: Boolean(p.onSale),
    featured: Boolean(p.featured),
    status: p.status,
    stock: variants.reduce((n, v) => n + (v.stock || 0), 0),
    lowStockThreshold: p.lowStockThreshold ?? 5,
    tags: p.tags || [],
    rating: p.rating || 0,
    reviews: (p.reviews || []).map((r, i) => ({
      id: `${p._id}-${i}`,
      name: r.name,
      rating: r.rating,
      title: r.title,
      body: r.body,
      date: r.date,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: variants.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      price: v.price ?? p.price,
      stock: v.stock,
    })),
  };
}

export async function getSettings() {
  let settings = await Settings.findOne({ key: "store" });
  if (!settings) settings = await Settings.create({ key: "store" });
  return settings;
}

export function shippingQuote(settings, subtotal, method) {
  if (method === "express") return settings.expressShipping;
  if (subtotal >= settings.freeShippingOver || subtotal === 0) return 0;
  return settings.standardShipping;
}

export function couponRate(settings, code) {
  if (!code) return null;
  const found = (settings.coupons || []).find(
    (c) => c.code.toUpperCase() === String(code).toUpperCase(),
  );
  return found ? found.rate : null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function queryProducts(query, { includeHidden = false } = {}) {
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(query.limit || "12", 10) || 12));
  const filter = {};
  if (!includeHidden) filter.status = "active";
  else if (query.status) filter.status = query.status;
  if (query.category && query.category !== "All") filter.category = query.category;
  if (query.featured === "1" || query.featured === "true") filter.featured = true;
  if (query.new === "1" || query.new === "true") filter.newArrival = true;
  if (query.sale === "1" || query.sale === "true") filter.onSale = true;
  if (query.ids) {
    const ids = String(query.ids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    filter._id = { $in: ids };
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ name: rx }, { description: rx }, { tags: rx }, { category: rx }];
  }
  if (query.size) {
    const sizes = String(query.size).split(",").map((s) => s.trim()).filter(Boolean);
    if (sizes.length) filter["variants.size"] = { $in: sizes };
  }
  if (query.color) {
    const colors = String(query.color).split(",").map((s) => s.trim()).filter(Boolean);
    if (colors.length) filter["variants.color"] = { $in: colors };
  }
  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
  }

  const sortMap = {
    featured: { featured: -1, createdAt: -1 },
    new: { createdAt: -1 },
    low: { price: 1 },
    high: { price: -1 },
  };
  const sort = sortMap[query.sort] || sortMap.featured;
  const [rows, total] = await Promise.all([
    CatalogProduct.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    CatalogProduct.countDocuments(filter),
  ]);
  return {
    products: rows.map(presentProduct),
    total,
    page,
    limit,
  };
}

export async function loadUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.cookies?.storeToken;
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
  if (!decoded?.id || decoded.type !== "store") return null;
  const user = await User.findById(decoded.id);
  if (!user || user.disabled) return null;
  return user;
}

export async function requireUser(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ message: "Sign in required." });
    if (!user.isEmailVerified) {
      return res.status(403).json({ message: "Verify your email to continue." });
    }
    req.storeUser = user;
    next();
  } catch (err) {
    res.status(500).json({ message: "Authentication failed." });
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ message: "Sign in required." });
    if (user.role !== "admin" || user.disabled) {
      return res.status(403).json({ message: "Admin access required." });
    }
    req.storeUser = user;
    next();
  } catch {
    res.status(500).json({ message: "Authentication failed." });
  }
}

export async function audit(user, action, entity, entityId, meta) {
  await AuditLog.create({
    admin: user?._id,
    adminEmail: user?.email,
    action,
    entity,
    entityId: entityId ? String(entityId) : undefined,
    meta,
  });
}

export async function resolveLines(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw Object.assign(new Error("Your bag is empty."), { status: 400 });
  }
  if (rawItems.length > 20) {
    throw Object.assign(new Error("Too many items."), { status: 400 });
  }
  const lines = [];
  for (const item of rawItems) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw Object.assign(new Error("Invalid quantity."), { status: 400 });
    }
    const product = await CatalogProduct.findOne({
      _id: item.productId,
      status: "active",
    });
    if (!product) {
      throw Object.assign(new Error("A product in your bag is no longer available."), {
        status: 400,
      });
    }
    const variant = product.variants.find((v) => v.sku === item.sku);
    if (!variant) {
      throw Object.assign(new Error("Choose a valid size and colour."), { status: 400 });
    }
    if (variant.stock < quantity) {
      throw Object.assign(
        new Error(`${product.name} does not have enough stock in that size.`),
        { status: 409 },
      );
    }
    const unitPrice = variant.price ?? product.price;
    lines.push({ product, variant, quantity, unitPrice });
  }
  return lines;
}

export async function priceLines(lines, { code, shippingMethod }) {
  const settings = await getSettings();
  const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const rate = code ? couponRate(settings, code) : null;
  if (code && rate == null) {
    throw Object.assign(new Error("Invalid discount code."), { status: 400 });
  }
  const discountAmount = rate ? Math.round(subtotal * rate * 100) / 100 : 0;
  const shippingAmount = shippingQuote(settings, subtotal, shippingMethod || "standard");
  const taxAmount = Math.round((subtotal - discountAmount) * (settings.taxRate || 0) * 100) / 100;
  const total = Math.max(0, subtotal - discountAmount + shippingAmount + taxAmount);
  return { settings, subtotal, discountAmount, shippingAmount, taxAmount, total, rate };
}

async function holdStock(lines) {
  const held = [];
  for (const line of lines) {
    const res = await CatalogProduct.updateOne(
      {
        _id: line.product._id,
        variants: { $elemMatch: { sku: line.variant.sku, stock: { $gte: line.quantity } } },
      },
      { $inc: { "variants.$.stock": -line.quantity } },
    );
    if (res.modifiedCount !== 1) {
      await releaseStock(held);
      throw Object.assign(new Error(`${line.product.name} just sold out.`), { status: 409 });
    }
    held.push(line);
  }
}

async function releaseStock(lines) {
  for (const line of lines) {
    await CatalogProduct.updateOne(
      { _id: line.product._id, "variants.sku": line.variant.sku },
      { $inc: { "variants.$.stock": line.quantity } },
    );
  }
}

export async function releaseOrderStock(order) {
  for (const item of order.items) {
    await CatalogProduct.updateOne(
      { _id: item.product, "variants.sku": item.sku },
      { $inc: { "variants.$.stock": item.quantity } },
    );
  }
}

function orderPayload(order, lines, priced, address) {
  return {
    items: lines.map((l) => ({
      product: l.product._id,
      name: l.product.name,
      slug: l.product.slug,
      image: l.product.images?.[0]?.url || l.product.thumbnail || "",
      sku: l.variant.sku,
      size: l.variant.size,
      color: l.variant.color,
      category: l.product.category,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    shippingAddress: address,
    shippingMethod: order.shippingMethod,
    shippingAmount: priced.shippingAmount,
    discountCode: order.discountCode,
    discountAmount: priced.discountAmount,
    subtotal: priced.subtotal,
    taxAmount: priced.taxAmount,
    total: priced.total,
  };
}

export function presentOrder(order) {
  const o = order.toObject ? order.toObject() : order;
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    email: o.email,
    items: (o.items || []).map((i) => ({
      ...i,
      product: i.product ? String(i.product) : undefined,
    })),
    shippingAddress: o.shippingAddress,
    shippingMethod: o.shippingMethod,
    shippingAmount: o.shippingAmount,
    discountCode: o.discountCode,
    discountAmount: o.discountAmount,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    total: o.total,
    currency: o.currency,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export async function createCheckout({ user, items, address, shippingMethod, code, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await StoreOrder.findOne({ idempotencyKey, user: user._id });
    if (existing) return { order: existing, reused: true };
  }
  const required = ["name", "line1", "city", "postal", "phone"];
  for (const key of required) {
    if (!address?.[key] || String(address[key]).trim().length < 2) {
      throw Object.assign(new Error("Complete the shipping address."), { status: 400 });
    }
  }
  const lines = await resolveLines(items);
  const priced = await priceLines(lines, { code, shippingMethod });
  await holdStock(lines);
  const orderNumber = `FLX-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const draft = {
    orderNumber,
    user: user._id,
    email: user.email,
    shippingMethod: shippingMethod === "express" ? "express" : "standard",
    discountCode: priced.rate ? String(code).toUpperCase() : undefined,
    currency: "usd",
    status: "pending",
    paymentStatus: "pending",
    idempotencyKey: idempotencyKey || undefined,
  };
  Object.assign(draft, orderPayload(draft, lines, priced, {
    name: String(address.name).slice(0, 80),
    line1: String(address.line1).slice(0, 120),
    line2: address.line2 ? String(address.line2).slice(0, 120) : "",
    city: String(address.city).slice(0, 80),
    region: address.region ? String(address.region).slice(0, 80) : "",
    postal: String(address.postal).slice(0, 20),
    country: address.country ? String(address.country).slice(0, 80) : "United States",
    phone: String(address.phone).slice(0, 30),
  }));
  const order = await StoreOrder.create(draft);
  await Payment.create({
    order: order._id,
    orderNumber: order.orderNumber,
    amount: order.total,
    currency: order.currency,
    status: "pending",
    provider: process.env.STRIPE_SECRET_KEY ? "stripe" : "dev",
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    if (isLive()) {
      await releaseOrderStock(order);
      await order.deleteOne();
      throw Object.assign(new Error("Payments are not configured."), { status: 500 });
    }
    return { order, devPayment: true };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const client = process.env.CLIENT_URL || "http://127.0.0.1:5173";
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: user.email,
      client_reference_id: order.orderNumber,
      metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
      success_url: `${client}/checkout?order=${order.orderNumber}&paid=1`,
      cancel_url: `${client}/checkout?order=${order.orderNumber}&paid=0`,
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(l.unitPrice * 100),
          product_data: { name: `${l.product.name} · ${l.variant.color} / ${l.variant.size}` },
        },
      })),
    },
    { idempotencyKey: idempotencyKey || order.orderNumber },
  );
  order.stripeSessionId = session.id;
  await order.save();
  return { order, url: session.url };
}

export async function markOrderPaid(order, { providerRef, provider = "stripe" } = {}) {
  if (order.paymentStatus === "paid") return order;
  order.paymentStatus = "paid";
  order.status = "confirmed";
  if (providerRef) order.stripePaymentIntentId = providerRef;
  await order.save();
  await Payment.findOneAndUpdate(
    { order: order._id },
    { status: "succeeded", provider, providerRef, amount: order.total },
    { upsert: true },
  );
  return order;
}

export async function markOrderFailed(order) {
  if (order.paymentStatus === "paid" || order.paymentStatus === "failed") return order;
  order.paymentStatus = "failed";
  await order.save();
  await releaseOrderStock(order);
  await Payment.findOneAndUpdate(
    { order: order._id },
    { status: "failed", amount: order.total },
    { upsert: true },
  );
  return order;
}

export async function cartView(userId) {
  const cart = await StoreCart.findOne({ user: userId });
  if (!cart) return [];
  const views = [];
  for (const item of cart.items) {
    const product = await CatalogProduct.findById(item.product);
    if (!product || product.status !== "active") continue;
    const variant = product.variants.find((v) => v.sku === item.sku);
    if (!variant) continue;
    const presented = presentProduct(product);
    views.push({
      product: presented,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      quantity: item.quantity,
      unitPrice: variant.price ?? product.price,
      stock: variant.stock,
    });
  }
  return views;
}

export async function upsertCart(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    await StoreCart.findOneAndUpdate(
      { user: userId },
      { user: userId, items: [] },
      { upsert: true },
    );
    return;
  }
  const lines = await resolveLines(items);
  const cart = await StoreCart.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      items: lines.map((l) => ({
        product: l.product._id,
        sku: l.variant.sku,
        quantity: l.quantity,
      })),
    },
    { upsert: true, returnDocument: "after" },
  );
  return cart;
}

export { User, CatalogProduct, StoreOrder, Payment, AuditLog, Category, Settings };
