import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
  },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        minLength: 0,
        required: true,
      },
      discount: {
        type: Number,
        required: false,
      },
      sku: {
        type: String,
        required: true,
      },
    },
  ],
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
    default: "pending",
  },
  ShippingAddress: {
    type: {
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: false,
        match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
      },
      phoneNumber: {
        type: String,
        required: false,
        match: [/^\+?[1-9]\d{1,14}$/, "Please use a valid phone number"],
      },
      street: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      postalCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
    },
    required: true,
  },
  billingAddress: {
    type: {
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: false,
        match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
      },
      phoneNumber: {
        type: String,
        required: false,
        match: [/^\+?[1-9]\d{1,14}$/, "Please use a valid phone number"],
      },
      street: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      postalCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
    },
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ["COD"],
    default: "COD",
  },
  deliveryDate: {
    type: Date,
    required: false,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  deliveredOn: {
    type: Date,
    required: false,
  },
  trackingId: {
    type: String,
    required: false,
  },
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
