import express from "express";
import validate from "../middlewares/validate.middleware.js";
import {
  addToCart as addToCartSchema,
  quantityUpdate as quantityUpdateSchema,
  removeFromCart as removeFromCartSchema,
} from "../validators/cartValidation.js";
import {
  addToCart as addToCartController,
  quantityUpdate as quantityUpdateController,
  getCart,
  removeFromCart,
} from "../controllers/cart.controller.js";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

router.post(
  "/add",
  authenticateUser,
  validate(addToCartSchema),
  addToCartController,
);
router.put(
  "/quantity",
  authenticateUser,
  validate(quantityUpdateSchema),
  quantityUpdateController,
);
router.get("/get", authenticateUser, getCart);
router.delete("/remove", validate(removeFromCartSchema), authenticateUser, removeFromCart);

export default router;
