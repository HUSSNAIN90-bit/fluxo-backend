import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    fabric: {
      type: String,
      required: function () {
        return this.category === "clothing";
      },
    },

    details: {
      overview: {
        type: String,
        required: true, 
        minlength: 50,
        maxlength: 500,
      },

      features: {
        type: [String],
        default: [],
      },

      materialDetails: {
        material: String,
        composition: String,
      },

      specifications: {
        weight: String,
        dimensions: String,
        color: {
          type: [String],
          default: [],
        },
        warranty: String,
      },

      careInstructions: {
        type: [String],
        default: [],
      },
    },

    variants: {
      type: [ 
        {
          attributes: {
            size: {
              type: String,
              enum: ["XS", "S", "M", "L", "XL", "XXL"],
              required: function () {
                return this.parent().category === "clothing";
              },
            },

            color: {
              type: String,
            },

            type: {
              type: String,
            },
          },

          price: {
            type: Number,
            required: true,
            min: 0,
          },

          stock: {
            type: Number,
            required: true,
            min: 0,
          },

          sku: {
            type: String,
            unique: true,
            sparse: true,
          },

          images: [
            {
              url: {
                type: String,
                required: true,
              },
              public_id: {
                type: String,
                required: true,
              },
            },
          ],
        },
      ],
      required: true,
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "At least one variant is required",
      },
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },
        public_id: {
          type: String,
          required: true,
        },
      },
    ],
    salesCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

const productModel = mongoose.model("Product", productSchema);

export default productModel;
