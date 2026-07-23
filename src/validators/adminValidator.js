import Joi from "joi";

const AdminSchema = Joi.object({
  username: Joi.string().min(3).max(20).required().messages({
    "string.base": "Username should be a string",
    "string.empty": "Username cannot be empty",
    "string.min": "Username should have a minimum length of 3",
    "string.max": "Username should have a maximum length of 20",
    "any.required": "Username is required",
  }),
  password: Joi.string().min(6).max(30).required().messages({
    "string.base": "Password should be a string",
    "string.empty": "Password cannot be empty",
    "string.min": "Password should have a minimum length of 6",
    "string.max": "Password should have a maximum length of 30",
    "any.required": "Password is required",
  }),
}).unknown(false);

export { AdminSchema };
