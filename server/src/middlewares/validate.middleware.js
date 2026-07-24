const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: true,
    allowUnknown: false,
  });

  if (error) {
    return res.status(400).json({
      message: error.details[0].message,
    });
  }

  req.validatedData = value;
  next();
};

export default validate;
