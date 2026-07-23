import mongoose from "mongoose";

const cartModel = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  products: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      sku: {
        type: String,
        required: true,
      },
      quantity: {
        type: Number,
        min: 1,
        default: 1,
      },
    },
  ],
  items: {
    type: Number,
    default: 0,
  }
});

cartModel.pre("save", function () {
  this.items = this.products.length;
});

const Cart = mongoose.model("Cart", cartModel);

export default Cart;