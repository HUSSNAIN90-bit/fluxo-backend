import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, alt: String },
  { _id: false },
);

const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true },
  size: { type: String, default: "" },
  color: { type: String, default: "" },
  colorHex: { type: String, default: "#111111" },
  price: { type: Number, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
});

const catalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true, maxlength: 4000 },
    shortDescription: { type: String, maxlength: 280 },
    category: { type: String, required: true, index: true },
    subcategory: { type: String, default: "", index: true },
    brand: { type: String, default: "Fluxo" },
    price: { type: Number, required: true, min: 0 },
    compareAt: { type: Number, min: 0 },
    images: { type: [imageSchema], default: [] },
    thumbnail: String,
    variants: {
      type: [variantSchema],
      validate: [(v) => v.length > 0, "At least one variant is required"],
    },
    tags: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      default: "active",
      index: true,
    },
    featured: { type: Boolean, default: false, index: true },
    newArrival: { type: Boolean, default: false, index: true },
    onSale: { type: Boolean, default: false, index: true },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    details: { type: [String], default: [] },
    materials: { type: String, default: "" },
    care: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    reviews: {
      type: [
        {
          name: String,
          rating: Number,
          title: String,
          body: String,
          date: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

catalogSchema.index({ name: "text", description: "text", tags: "text" });
catalogSchema.index({ "variants.sku": 1 }, { unique: true });
catalogSchema.index({ createdAt: -1 });

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CatalogProduct",
            required: true,
          },
          sku: { type: String, required: true },
          quantity: { type: Number, required: true, min: 1, max: 10 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "CatalogProduct" },
    name: String,
    slug: String,
    image: String,
    sku: String,
    size: String,
    color: String,
    category: String,
    quantity: { type: Number, min: 1 },
    unitPrice: { type: Number, min: 0 },
  },
  { _id: false },
);

const storeOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: { type: String, required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      region: String,
      postal: String,
      country: String,
      phone: String,
    },
    shippingMethod: {
      type: String,
      enum: ["standard", "express"],
      default: "standard",
    },
    shippingAmount: { type: Number, default: 0 },
    discountCode: String,
    discountAmount: { type: Number, default: 0 },
    subtotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentMethod: { type: String, default: "card" },
    stripeSessionId: { type: String, index: true, sparse: true },
    stripePaymentIntentId: String,
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

storeOrderSchema.index({ createdAt: -1 });

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreOrder",
      index: true,
    },
    orderNumber: { type: String, index: true },
    amount: Number,
    currency: { type: String, default: "usd" },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      index: true,
    },
    provider: { type: String, default: "stripe" },
    providerRef: String,
  },
  { timestamps: true },
);

const auditSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    adminEmail: String,
    action: { type: String, required: true, index: true },
    entity: String,
    entityId: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "store" },
    storeName: { type: String, default: "Fluxo" },
    currency: { type: String, default: "USD" },
    supportEmail: { type: String, default: "hello@fluxo.example" },
    taxRate: { type: Number, default: 0, min: 0, max: 0.5 },
    freeShippingOver: { type: Number, default: 500 },
    standardShipping: { type: Number, default: 12 },
    expressShipping: { type: Number, default: 25 },
    coupons: {
      type: [{ code: String, rate: Number }],
      default: () => [
        { code: "FLUXO10", rate: 0.1 },
        { code: "ATELIER", rate: 0.15 },
      ],
    },
    notifyOrders: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CatalogProduct =
  mongoose.models.CatalogProduct ||
  mongoose.model("CatalogProduct", catalogSchema);
export const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);
export const StoreCart =
  mongoose.models.StoreCart || mongoose.model("StoreCart", cartSchema);
export const StoreOrder =
  mongoose.models.StoreOrder || mongoose.model("StoreOrder", storeOrderSchema);
export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
export const Settings =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
