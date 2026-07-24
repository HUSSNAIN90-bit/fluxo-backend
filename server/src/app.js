import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

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
    limit: "10kb",
  }),
); // payload limit

app.use(sanitizeRequest);

// Cookie parser requires secret string as first parameter
app.use(
  cookieParser(
    process.env.COOKIE_SECRET ||
      process.env.JWT_SECRET ||
      "fluxo_default_cookie_secret",
  ),
);

// CORS configuration supporting localhost 3000, 3001 and deployed Vercel client
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "https://fluxo-ten-plum.vercel.app/",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Always allow requests from allowedOrigins, or any origin in non-production
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== "production"
      ) {
        callback(null, true);
      } else {
        callback(null, process.env.CLIENT_URL);
      }
    },
    credentials: true,
  }),
);

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

  res.status(500).json({
    message: err.message || "Internal Server Error",
  });
});

export default app;
