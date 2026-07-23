import Joi from 'joi';

const addToCart = Joi.object({
  productId: Joi.string().required(),
  sku: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
}).unknown(false);

const quantityUpdate = Joi.object({
  productId: Joi.string().required(),
  sku: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
}).unknown(false);

const removeFromCart = Joi.object({
  productId: Joi.string().required(),
  sku: Joi.string().required(),
}).unknown(false);

export { addToCart, quantityUpdate, removeFromCart };
