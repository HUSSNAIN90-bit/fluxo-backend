import express from "express";
import {
  authenticateAdmin,
  authenticateUser,
  authenticateAdminOrUser,
} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  cancelOrderSchema,
  orderSchema,
  updateOrderSchema,
} from "../validators/orderValidator.js";
import {
  createOrder,
  updateOrder,
  orderDelivered,
  cancelOrder,
  getOrderDetails,
  getAllUserOrders,
  getAllOrders,
  getStatusOrder,
} from "../controllers/order.controller.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

/**
 * Create Order
 *
 * @router POST /api/orders/add
 */
router.post("/add", authenticateUser, validate(orderSchema), createOrder);

/**
 * Update Order
 *
 * @router PUT /api/orders/:orderId
 */
router.put(
  "/:orderId",
  authenticateAdmin,
  validate(updateOrderSchema),
  updateOrder,
);

/**
 * Order Delivered
 *
 * @router PUT /api/orders/:orderId/delivered
 */
router.put("/:orderId/delivered", authenticateAdmin, orderDelivered);

/**
 * Cancel Order
 * Allowed for both Admin and User
 *
 * @router PUT /api/orders/:orderId/cancel
 */
router.put(
  "/:orderId/cancel",
  authenticateAdminOrUser,
  validate(cancelOrderSchema),
  cancelOrder,
);
/**
 * getAll Orders for User
 *
 * @router GET /api/orders/my
 */
router.get("/my", authenticateUser, getAllUserOrders);

/**
 * get Status Orders (Admin Only)
 *
 * @route GET /api/orders/:status
 */
router.get("/:status", authenticateAdmin, getStatusOrder);

/**
 * get Order Details
 *
 * @router GET /api/orders/:orderId
 */
router.get("/:orderId", authenticateAdminOrUser, getOrderDetails);

/**
 * get All Orders (Admin only)
 *
 * @router GET /api/orders
 */
router.get("/", authenticateAdmin, getAllOrders);

export default router;
