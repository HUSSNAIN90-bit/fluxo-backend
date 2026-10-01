import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import storeRouter, { stripeWebhook } from "./store/router.js";
import { isLive } from "./store/env.js";

const app = express();

app.post(
  "/api/store/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://fluxo-teal-eta.vercel.app",
    process.env.CLIENT_URL,
  ].filter(Boolean),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (allowedOrigins.has(origin) || (!isLive() && local)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(
  cookieParser(
    process.env.COOKIE_SECRET ||
      process.env.JWT_SECRET ||
      "fluxo_default_cookie_secret",
  ),
);

const sanitizeString = (value) => {
  if (typeof value !== "string") return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

const sanitizeObject = (input) => {
  if (Array.isArray(input)) return input.map(sanitizeObject);
  if (input && typeof input === "object") {
    Object.keys(input).forEach((key) => {
      if (key.startsWith("$") || key.includes(".")) {
        delete input[key];
      } else {
        input[key] = sanitizeObject(input[key]);
      }
    });
    return input;
  }
  return sanitizeString(input);
};

const sanitizeRequest = (req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.query && typeof req.query === "object") sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  next();
};

app.use(
  express.json({
    limit: "200kb",
  }),
);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api/store", storeRouter);

app.use(sanitizeRequest);

/**
 * Routes
 */
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import productRoutes from "./routes/product.routes.js";
import promotionRoutes from "./routes/promotion.routes.js";
import addressRoutes from "./routes/address.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";

app.use("/api/auth/admin", adminRoutes);
app.use("/api/auth/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/address", addressRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: status >= 500 ? "Internal Server Error" : err.message,
  });
});

export default app;
