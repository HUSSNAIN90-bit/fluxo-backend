import joi from "joi"

const userSchema = joi.object({
    name: joi.string().min(3).max(30).optional(),
    email: joi.string().email().required(),
    password: joi.string().min(8).required(),
    phoneNumber: joi.number().optional()
}).unknown(false);

const loginValidation = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(8).required()
}).unknown(false);

const otpSchema = joi.object({
    email: joi.string().email().required(),
    otp: joi.string().length(6).pattern(/^\d+$/).required(),
    purpose: joi.string().valid("signup", "login").optional(),
}).unknown(false);

const changePasswordSchema = joi.object({
    oldPassword: joi.string().min(6).required(),
    newPassword: joi.string().min(6).required()
}).unknown(false);

export { userSchema, loginValidation, otpSchema, changePasswordSchema };  