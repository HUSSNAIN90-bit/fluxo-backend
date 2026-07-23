import express from "express";
import {
  createNewPromotion,
  sendPromotionEmailById,
  deletePromotion,
  renewPromotion,
  getAllPromotions,
  getCurrentPromotions,
  getPromotionsByCategory,
  getPromotionsByProduct,
  getPromotionById,
} from "../controllers/promotion.controller.js";
import validate from "../middlewares/validate.middleware.js";
import { PromotionSchema } from "../validators/promotionValidator.js";
import { authenticateAdmin } from "../middlewares/auth.middleware.js";
import { uploadMiddleware } from "../middlewares/upload.middleware.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

/**
 * Promotion routes
 */

/**
 * Create a promotion
 * @route POST /api/promotions/create
 */
router.post(
  "/create",
  authenticateAdmin,
  uploadMiddleware,
  validate(PromotionSchema),
  createNewPromotion,
);

/**
 * Send promotion email to subscribed users
 * @route POST /api/promotions/:id/send-email
 */
router.post(
  "/:id/send-email",
  authenticateAdmin,
  sendPromotionEmailById,
);

/**
 * Renew a promotion
 * @route POST /api/promotions/:id/renew
 */
router.post("/:id/renew", authenticateAdmin, renewPromotion);

/**
 * Get all promotions 
 * 
 * @route GET /api/promotions/all
 */
router.get("/all", authenticateAdmin, getAllPromotions);

/**
 * Get current promotions
 * @route GET /api/promotions/current
 */
router.get("/current", getCurrentPromotions);

/**
 * Get promotions by category
 * @route GET /api/promotions/category/:category
 */
router.get("/category/:category", getPromotionsByCategory);

/**
 * Get promotions by product
 * @route GET /api/promotions/product/:product
 * 
 */
router.get("/product/:product", getPromotionsByProduct);

/**
 * Get promotion by id
 * @route GET /api/promotions/:id
 */
router.get("/:id", getPromotionById);

/**
 * Delete a promotion
 * @route DELETE /api/promotions/:id
 */
router.delete("/:id", authenticateAdmin, deletePromotion);

export default router;
