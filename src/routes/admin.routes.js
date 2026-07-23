import express from "express";
import {
  registerAdmin,
  loginAdmin,
} from "../controllers/admin.controller.js";
import { authenticateAdmin } from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { AdminSchema } from "../validators/adminValidator.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

/**
 * Admin routes
 *
 * This file defines the routes for admin-related operations. It includes endpoints for managing users, products, orders, and other administrative tasks.
 */

/**
 * Admin Register
 *
 * POST /api/auth/admin/register
 */
router.post("/register", validate(AdminSchema), registerAdmin);

/**
 * Admin Login
 *
 * POST /api/auth/admin/login
 */
router.post("/login", validate(AdminSchema), loginAdmin);

/**
 * Admin Authentication
 *
 * POST /api/auth/admin/authenticate
 */
router.post("/authenticate", authenticateAdmin, (req, res) => {
  return res.json({ message: "Admin authenticated successfully" });
});

export default router;
