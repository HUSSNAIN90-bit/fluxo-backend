import Joi from "joi";

const PromotionSchema = Joi.object({
  title: Joi.string().min(3).max(100).required().messages({
    "string.empty": "Title is required and cannot be empty.",
    "string.min": "Title must be at least 3 characters long.",
    "string.max": "Title must not exceed 100 characters.",
    "any.required": "Title is a required field.",
  }),

  description: Joi.string().min(10).max(200).required().messages({
    "string.empty": "Description is required and cannot be empty.",
    "string.min": "Description must be at least 10 characters long.",
    "string.max": "Description must not exceed 200 characters.",
    "any.required": "Description is a required field.",
  }),

  type: Joi.string().valid("percentage", "fixed").required().messages({
    "any.only": 'Type must be either "percentage" or "fixed".',
    "any.required": "Type is a required field.",
    "string.empty": "Type cannot be empty.",
  }),

  value: Joi.number().min(0).max(100).required().messages({
    "number.base": "Value must be a number.",
    "number.min": "Value must be at least 0.",
    "number.max": "Value must not exceed 100.",
    "any.required": "Value is a required field.",
  }),

  startDate: Joi.date().required().messages({
    "date.base": "Start date must be a valid date.",
    "any.required": "Start date is a required field.",
  }),

  endDate: Joi.date().required().messages({
    "date.base": "End date must be a valid date.",
    "any.required": "End date is a required field.",
  }),

  categories: Joi.array()
    .items(
      Joi.string().messages({
        "string.base": "Each category must be a string.",
      }),
    )
    .optional()
    .messages({
      "array.base": "Categories must be an array of strings.",
    }),

  products: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().required().messages({
          "string.empty": "Product ID is required for each product.",
          "any.required": "Product ID is required.",
        }),
      }).messages({
        "object.base": "Each product must be an object with productId.",
      }),
    )
    .optional()
    .messages({
      "array.base": "Products must be an array of objects.",
    }),
}).unknown(false);

export { PromotionSchema };
