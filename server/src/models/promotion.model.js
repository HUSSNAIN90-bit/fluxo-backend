import mongoose from "mongoose";

const promotionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 100,
  },

  description: {
    type: String,
    required: true,
    minLength: 10,
    maxLength: 200,
  },
  bannerImages: [
    {
      url: String,
      public_id: String,
    },
  ],

  type: {
    type: String,
    enum: ["percentage", "fixed"],
  },

  value: {
    type: Number,
    min: 0,
    max: 100,
    required: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },

  products: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  ],

  categories: [String],
});

const promotionModel = mongoose.model("Promotion", promotionSchema);

export default promotionModel;
