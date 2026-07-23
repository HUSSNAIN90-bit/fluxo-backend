import Order from "../models/order.model.js";
import ProducModel from "../models/product.model.js";
import Promotion from "../models/promotion.model.js";
import Review from "../models/reviews.model.js";
import User from "../models/user.model.js";
import { sendEmail } from "../services/email.service.js";
import {
  loadOrderTemplate,
  loadOrderDeliveredTemplate,
} from "../utils/emailTemplate.js";

const generateOrderId = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let orderId = "ORD-";
  for (let i = 0; i < 12; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId;
};

const createOrder = async (req, res, next) => {
  try {
    const orderData = req.validatedData;
    const userId = req.user._id;

    const items = await Promise.all(
      orderData.items.map(async (item) => {
        const product = await ProducModel.findById(item.product);

        if (!product) {
          throw new Error(`Product ${item.product} not found`);
        }

        // Check stock availability. Product may have variants with stock.
        const availableStock =
          product.variants && product.variants.length
            ? product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
            : product.stock || 0;

        if (item.quantity > availableStock) {
          throw new Error(
            `Insufficient stock for product ${item.product}. Requested ${item.quantity}, available ${availableStock}`,
          );
        }

        // Find applicable promotions for this product
        const promotion = await Promotion.findOne({
          products: item.product,
          isActive: true,
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        });

        // Calculate discount and price
        const basePrice = product.price || 0;
        let discountAmount = 0;

        if (promotion) {
          if (promotion.type === "percentage") {
            discountAmount = (basePrice * promotion.value) / 100;
          } else if (promotion.type === "fixed") {
            discountAmount = promotion.value;
          }
        }

        const finalPrice = Math.max(basePrice - discountAmount, 0);
        const totalItemPrice = finalPrice * item.quantity;

        return {
          product: product._id,
          quantity: item.quantity,
          price: finalPrice,
          discount: discountAmount,
          sku: product.sku || product._id.toString(),
        };
      }),
    );

    // Calculate total price
    const totalPrice = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const newOrder = new Order({
      user: userId,
      orderId: generateOrderId(),
      items: items,
      totalPrice: totalPrice,
      ShippingAddress: orderData.ShippingAddress,
      billingAddress: orderData?.billingAddress || orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod || "COD",
    });

    await newOrder.save();

    // Fetch user details for email
    const user = await User.findById(userId);

    // Prepare order data for email template
    const orderForEmail = {
      orderId: newOrder.orderId,
      createdAt: newOrder.createdAt,
      status: newOrder.status,
      customerName: user.fullName || user.firstName || "Valued Customer",
      customerEmail: user.email,
      customerPhone: user.phoneNumber || "N/A",
      items: await Promise.all(
        newOrder.items.map(async (item) => {
          const product = await ProducModel.findById(item.product);
          return {
            name: product.name,
            quantity: item.quantity,
            price: item.price,
          };
        }),
      ),
      subtotal: newOrder.totalPrice,
      shipping: 0,
      totalAmount: newOrder.totalPrice,
      shippingAddress: newOrder.ShippingAddress,
    };

    // Load email template and send
    try {
      const emailHtml = await loadOrderTemplate(orderForEmail);
      await sendEmail({
        to: user.email,
        subject: `Order Confirmation - ${newOrder.orderId}`,
        html: emailHtml,
      });
    } catch (emailErr) {
      console.error("Failed to send order confirmation email:", emailErr);
      // Don't fail the order creation if email fails
    }

    returnres.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    next(err);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const updateDetail = req.validatedData;
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res
        .status(400)
        .json({ status: "failed", message: "Order Not found" });
    }

    if (updateDetail.status) {
      const allowedStatusUpdates = ["processing", "shipped"];
      if (!allowedStatusUpdates.includes(updateDetail.status)) {
        return res.status(400).json({
          status: "failed",
          message: "Status can only be updated to processing or shipped",
        });
      }

      const statusOrderMap = {
        pending: 0,
        processing: 1,
        shipped: 2,
        delivered: 3,
        cancelled: 4,
      };

      const currentStatusIndex = statusOrderMap[order.status];
      const requestedStatusIndex = statusOrderMap[updateDetail.status];

      if (requestedStatusIndex <= currentStatusIndex) {
        return res.status(400).json({
          status: "failed",
          message: "Cannot move order status backward or to the same status",
        });
      }

      if (updateDetail.status === "shipped") {
        if (!updateDetail.deliveryDate && !updateDetail.trackingId)
          return res.status(400).json({
            status: "failed",
            message: "deliveryDate and trackingId required if order shipped!",
          });

        await Promise.all(
          order.items.map(async (item) => {
            const product = await ProducModel.findById(item.product);
            if (!product) {
              throw new Error(`Product ${item.product} not found`);
            }

            let variant;
            if (product.variants && product.variants.length) {
              variant =
                product.variants.find((v) => v.sku === item.sku) ||
                product.variants.find((v) => v._id.toString() === item.sku) ||
                product.variants[0];
            }

            if (variant) {
              if (item.quantity > variant.stock) {
                throw new Error(
                  `Insufficient stock for product ${product._id}. Requested ${item.quantity}, available ${variant.stock}`,
                );
              }
              variant.stock -= item.quantity;
            } else if (typeof product.stock === "number") {
              if (item.quantity > product.stock) {
                throw new Error(
                  `Insufficient stock for product ${product._id}. Requested ${item.quantity}, available ${product.stock}`,
                );
              }
              product.stock -= item.quantity;
            } else {
              throw new Error(
                `No stock information available for product ${product._id}`,
              );
            }

            product.salesCount = (product.salesCount || 0) + item.quantity;
            await product.save();
          }),
        );
      }
    }

    const previousStatus = order.status;
    Object.assign(order, updateDetail);
    await order.save();

    // Send email notification if status changed
    if (previousStatus !== updateDetail.status && updateDetail.status) {
      try {
        const user = await User.findById(order.user);
        const orderForEmail = {
          orderId: order.orderId,
          createdAt: order.createdAt,
          status: order.status,
          customerName: user.fullName || user.firstName || "Valued Customer",
          customerEmail: user.email,
          customerPhone: user.phoneNumber || "N/A",
          items: await Promise.all(
            order.items.map(async (item) => {
              const product = await ProducModel.findById(item.product);
              return {
                name: product.name,
                quantity: item.quantity,
                price: item.price,
              };
            }),
          ),
          subtotal: order.totalPrice,
          shipping: 0,
          totalAmount: order.totalPrice,
          shippingAddress: order.ShippingAddress,
        };

        const emailHtml = await loadOrderTemplate(orderForEmail);
        const statusMessages = {
          processing: "Your order is being processed",
          shipped: `Your order is on the way! Tracking ID: ${updateDetail.trackingId || "N/A"}`,
          delivered: "Your order has been delivered",
        };

        await sendEmail({
          to: user.email,
          subject: `Order ${order.orderId} - ${statusMessages[order.status] || "Status Updated"}`,
          html: emailHtml,
        });
      } catch (emailErr) {
        console.error("Failed to send order status update email:", emailErr);
        // Don't fail the order update if email fails
      }
    }

    return res
      .status(200)
      .json({ status: "success", message: "Order Details Updated" });
  } catch (err) {
    next(err);
  }
};

const orderDelivered = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOneAndUpdate(
      { orderId: orderId },
      {
        deliveredOn: Date.now(),
        isPaid: true,
        status: "delivered",
      },
      { new: true },
    );

    if (!order)
      return res
        .status(400)
        .json({ status: "failed", message: "Order Not Fount" });

    // Send delivery notification email
    try {
      const user = await User.findById(order.user);
      const orderForEmail = {
        orderId: order.orderId,
        createdAt: order.createdAt,
        deliveredOn: order.deliveredOn,
        status: "delivered",
        customerName: user.fullName || user.firstName || "Valued Customer",
        customerEmail: user.email,
        customerPhone: user.phoneNumber || "N/A",
        items: await Promise.all(
          order.items.map(async (item) => {
            const product = await ProducModel.findById(item.product);
            return {
              name: product.name,
              quantity: item.quantity,
              price: item.price,
            };
          }),
        ),
        subtotal: order.totalPrice,
        shipping: 0,
        totalAmount: order.totalPrice,
        shippingAddress: order.ShippingAddress,
      };

      const emailHtml = await loadOrderDeliveredTemplate(orderForEmail);
      await sendEmail({
        to: user.email,
        subject: `Order ${order.orderId} - Delivered Successfully`,
        html: emailHtml,
      });
    } catch (emailErr) {
      console.error("Failed to send delivery notification email:", emailErr);
      // Don't fail the delivery update if email fails
    }

    return res.status(200).json({ status: "success", order });
  } catch (err) {
    next(err);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.validatedData;
    const order = await Order.findOne({ orderId: orderId });
    if (!order)
      return res
        .status(400)
        .json({ status: "failed", message: "Order Not Fount" });

    // Verify authorization: user can only cancel their own order
    if (
      req.userType === "user" &&
      order.userId.toString() !== req.userId.toString()
    ) {
      return res.status(403).json({
        status: "failed",
        message: "You can only cancel your own orders",
      });
    }

    if (!reason)
      return res.status(400).json({
        status: "failed",
        message: "Reason for cancellation is required",
      });

    if (order.status === "cancelled")
      return res
        .status(400)
        .json({ status: "failed", message: "Order Already Cancelled" });
    if (order.status === "delivered")
      return res
        .status(400)
        .json({ status: "failed", message: "Cannot cancel delivered order" });
    if (order.status === "shipped")
      return res
        .status(400)
        .json({ status: "failed", message: "Cannot cancel shipped order" });

    order.status = "cancelled";
    Review.create({
      user: order.user,
      product: order.items[0].product,
      rating: 1,
      comment: reason,
    });
    await order.save();

    // Send cancellation notification email
    try {
      const user = await User.findById(order.user);
      const orderForEmail = {
        orderId: order.orderId,
        createdAt: order.createdAt,
        status: "cancelled",
        customerName: user.fullName || user.firstName || "Valued Customer",
        customerEmail: user.email,
        customerPhone: user.phoneNumber || "N/A",
        items: await Promise.all(
          order.items.map(async (item) => {
            const product = await ProducModel.findById(item.product);
            return {
              name: product.name,
              quantity: item.quantity,
              price: item.price,
            };
          }),
        ),
        subtotal: order.totalPrice,
        shipping: 0,
        totalAmount: order.totalPrice,
        shippingAddress: order.ShippingAddress,
      };

      const emailHtml = await loadOrderTemplate(orderForEmail);
      await sendEmail({
        to: user.email,
        subject: `Order ${order.orderId} - Cancelled`,
        html: emailHtml,
        text: `Your order ${order.orderId} has been cancelled.\n\nReason: ${reason}`,
      });
    } catch (emailErr) {
      console.error("Failed to send order cancellation email:", emailErr);
      // Don't fail the cancellation if email fails
    }

    return res.json({
      status: "success",
      message: "Order cancelled successfully",
      order,
    });
  } catch (err) {
    next(err);
  }
};

const getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId: orderId }).populate(
      "items.product",
      "name price sku",
    );
    if (!order)
      return res
        .status(400)
        .json({ status: "failed", message: "Order Not Found" });

    returnres.json({ status: "success", order });
  } catch (err) {
    next(err);
  }
};

const getAllUserOrders = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Extract pagination parameters from query, with defaults
    const page = parseInt(req.query.page, 10) || 1; // 1-based page index
    const limit = parseInt(req.query.limit, 10) || 10; // default limit per page
    const skip = (page - 1) * limit;

    // Get total count for this user
    const total = await Order.countDocuments({ user: userId });

    // Get paginated data - most recent first
    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.product", "name price sku");

    returnres.json({
      status: "success",
      orders,
      page,
      limit,
      total,
      hasMore: skip + orders.length < total,
    });
  } catch (err) {
    next(err);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    // Extract pagination parameters from query params, set defaults for infinite scrolling
    const page = parseInt(req.query.page, 10) || 1; // 1-based page index
    const limit = parseInt(req.query.limit, 10) || 20; // Items per page, default 20
    const skip = (page - 1) * limit;

    // Get total number of orders for client reference
    const total = await Order.countDocuments();

    // Fetch paginated orders sorted by newest first
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.product", "name price sku");

    return res.json({
      status: "success",
      orders,
      page,
      limit,
      total,
      hasMore: skip + orders.length < total,
    });
  } catch (err) {
    next(err);
  }
};

const getStatusOrder = async (req, res, next) => {
  try {
    const { status } = req.params;
    // Infinite scrolling pagination params
    const page = parseInt(req.query.page, 10) || 1; // default page 1
    const limit = parseInt(req.query.limit, 10) || 20; // default limit 20
    const skip = (page - 1) * limit;

    // Get total count for reference
    const total = await Order.countDocuments({ status });

    // Paginated query, most recent first
    const orders = await Order.find({ status })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.product", "name price sku");

    returnres.status(200).json({
      status: "success",
      orders,
      page,
      limit,
      total,
      hasMore: skip + orders.length < total,
    });
  } catch (err) {
    next(err);
  }
};

export {
  createOrder,
  updateOrder,
  orderDelivered,
  cancelOrder,
  getOrderDetails,
  getAllUserOrders,
  getAllOrders,
  getStatusOrder
};
