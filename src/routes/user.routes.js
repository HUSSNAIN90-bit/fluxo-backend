import express from "express";
import expressRateLimit from "express-rate-limit";

const limiter = expressRateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

import {
  createUser,
  loginUser,
  verifyOtp,
  getUserProfile,
  logoutUser,
  changePassword,
  changeUserProfile,
} from "../controllers/user.controller.js";
import {
  loginValidation,
  userSchema,
  otpSchema,
  changePasswordSchema,
} from "../validators/userValidator.js";
import validate from "../middlewares/validate.middleware.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import { uploadMiddleware } from "../middlewares/upload.middleware.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

/**
 * Creating User Account
 * @route POST /api/auth/users
 */
router.post("/", validate(userSchema), createUser);

/**
 * Verify OTP
 * @route POST /api/auth/users/verify-otp
 */
router.post("/verify-otp",  validate(otpSchema), verifyOtp);

/**
 * User Login
 * @route POST /api/auth/users/login
 */
router.post("/login",  validate(loginValidation), loginUser);

/**
 * Change Password
 * @route POST /api/auth/users/change-password
 */
router.post("/change-password",  validate(changePasswordSchema), changePassword);

/**
 * Change User Profile
 * 
 * @route PUT /api/auth/users/change-profile
 */
router.put("/change-profile", uploadMiddleware, changeUserProfile);

/**
 * Get user Profile
 *
 * @route GET /api/auth/users/:id
 */
router.get("/profile",  authenticateUser, getUserProfile);

/**
 * User Logout
 * @route POST /api/auth/logout
 */
router.post("/logout",  logoutUser);

export default router;
