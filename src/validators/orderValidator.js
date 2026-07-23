import Joi from "joi";

const addressSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  postalCode: Joi.string().required(),
  country: Joi.string().required(),
});

const orderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        product: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().min(0).optional(),
        discount: Joi.number().min(0).optional(),
        sku: Joi.string().optional(),
      }),
    )
    .min(1)
    .required(),
  ShippingAddress: addressSchema.required(),
  billingAddress: addressSchema.optional(),
  paymentMethod: Joi.string().valid("COD").default("COD"),
});

const updateOrderSchema = Joi.object({
  trackingId: Joi.string().optional(),
  status: Joi.string().valid("processing", "shipped").optional(),
  deliveryDate: Joi.date().optional(),
});

const cancelOrderSchema = Joi.object({
  reason: Joi.string().required(),
});
export { orderSchema, updateOrderSchema, cancelOrderSchema };
