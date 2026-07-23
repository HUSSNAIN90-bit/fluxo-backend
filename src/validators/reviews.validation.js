import Joi from "joi";

const reviewSchema = Joi.object({
    rating: Joi.number().required().min(1).max(5),
    comment: Joi.string().required().min(10).max(500),
    images: Joi.forbidden()
}, {
    abortEarly: false,
    allowUnknown: false,
}).unknown(false);

export { reviewSchema };
