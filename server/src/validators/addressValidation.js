import Joi from "joi";

const addressSchema = Joi.object({
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  postalCode: Joi.string().required(),
  country: Joi.string().required(),
  phoneNumber: Joi.string().optional(),
  type: Joi.string().valid("home", "work", "other").optional(),
}).unknown(false);

export { addressSchema };
