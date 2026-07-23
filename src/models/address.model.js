import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    street: {
      type: String,
      required: true,
      minLength: 3,
    },
    city: {
      type: String,
      required: true,
      minLength: 2,
    },
    state: {
      type: String,
      required: true,
      minLength: 2,
    },
    postalCode: {
      type: String,
      required: true,
      minLength: 4,
    },
    country: {
      type: String,
      required: true,
      minLength: 2,
    },
    phoneNumber: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      enum: ["home", "work", "other"],
      default: "home",
    },
    default: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Address = mongoose.model("Address", addressSchema);

export default Address;