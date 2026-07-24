import Joi from "joi";

const ProductSchema = Joi.object({
  name: Joi.string().min(3).max(30).required(),

  description: Joi.string().min(10).max(500).trim().required().messages({
    "string.base": "Product description should be a string",
    "string.empty": "Product description cannot be empty",
    "string.min": "Description must be at least 10 characters",
    "string.max": "Description must be at most 500 characters",
    "any.required": "Product description is required",
  }),

  category: Joi.string().valid("clothing", "electronics", "books").required(),

  fabric: Joi.string().when("category", {
    is: "clothing",
    then: Joi.string().required().messages({
      "any.required": "Fabric is required for clothing products",
    }),
    otherwise: Joi.string().optional(),
  }),

  details: Joi.object({
    overview: Joi.string().optional(),

    features: Joi.array().items(Joi.string()).optional(),

    materialDetails: Joi.object({
      material: Joi.string().optional(),
      composition: Joi.string().optional(),
    }).optional(),

    specifications: Joi.object({
      weight: Joi.string().optional(),
      dimensions: Joi.string().optional(),
      color: Joi.array().items(Joi.string()).optional(),
      warranty: Joi.string().optional(),
    }).optional(),

    careInstructions: Joi.array().items(Joi.string()).optional(),
  })
    .max(20)
    .optional(),

  variants: Joi.array()
    .items(
      Joi.object({
        attributes: Joi.object({
          size: Joi.string().valid("XS", "S", "M", "L", "XL", "XXL").optional(),
          color: Joi.string().optional(),
          type: Joi.string().optional(),
        }).optional(),

        price: Joi.number().precision(2).min(0),

        stock: Joi.number().min(0).required().messages({
          "number.base": "Variant stock must be a number",
          "number.min": "Variant stock cannot be negative",
          "any.required": "Variant stock is required",
        }),

        sku: Joi.string().alphanum().min(3).max(20),

        variantImages: Joi.forbidden(),
        variantImageIndexes: Joi.array().items(Joi.number().min(0)).optional(),
      }),
    )
    .min(1)
    .required()
    .messages({
      "array.base": "Variants must be an array",
      "array.min": "At least one variant is required",
      "any.required": "Variants are required",
    }),

  images: Joi.forbidden(),
  productImagesIndex: Joi.array().items(Joi.number().min(0)).optional(),
}).unknown(false);

const UpdateProductValidation = Joi.object({
  name: Joi.string().min(3).max(30).optional(),
  description: Joi.string().min(10).max(500).trim().optional().messages({
    "string.base": "Product description should be a string",
    "string.empty": "Product description cannot be empty",
    "string.min": "Description must be at least 10 characters",
    "string.max": "Description must be at most 500 characters",
  }),
  category: Joi.string().valid("clothing", "electronics", "books").optional(),
  fabric: Joi.string().when("category", {
    is: "clothing",
    then: Joi.string().required().messages({
      "any.required": "Fabric is required for clothing products",
    }),
    otherwise: Joi.string().optional(),
  }),
  details: Joi.object({
    overview: Joi.string().optional(),
    features: Joi.array().items(Joi.string()).optional(),
    materialDetails: Joi.object({
      material: Joi.string().optional(),
      composition: Joi.string().optional(),
    }).optional(),
    specifications: Joi.object({
      weight: Joi.string().optional(),
      dimensions: Joi.string().optional(),
      color: Joi.array().items(Joi.string()).optional(),
      warranty: Joi.string().optional(),
    }).optional(),
    careInstructions: Joi.array().items(Joi.string()).optional(),
  })
    .max(20)
    .optional(),
  variants: Joi.array()
    .items(
      Joi.object({
        attributes: Joi.object({
          size: Joi.string().valid("XS", "S", "M", "L", "XL", "XXL").optional(),
          color: Joi.string().optional(),
          type: Joi.string().optional(),
        }).optional(),
        price: Joi.number().precision(2).min(0).optional(),
        stock: Joi.number().min(0).optional().messages({
          "number.base": "Variant stock must be a number",
          "number.min": "Variant stock cannot be negative",
        }),
        sku: Joi.string().alphanum().min(3).max(20).optional(),
        variantImages: Joi.forbidden(),
        variantImageIndexes: Joi.array().items(Joi.number().min(0)).optional(),
      }),
    )
    .min(1)
    .optional()
    .messages({
      "array.base": "Variants must be an array",
      "array.min": "At least one variant is required",
    }),
  images: Joi.forbidden(),
  productImagesIndex: Joi.array().items(Joi.number().min(0)).optional(),
}).unknown(false);

export { ProductSchema, UpdateProductValidation };
