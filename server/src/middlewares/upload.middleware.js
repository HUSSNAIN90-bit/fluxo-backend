import multer from "multer";

const storage = multer.memoryStorage(); // using Ram memory

const allowedTypes = ["image/jpeg", "image/png", "image/webp"]; // allowed file types

const fileFilter = (req, file, cb) => {
  // if filetype is not allowedTypes then throw error  
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP images are allowed"), false);
  }
  // if filltype is correct then continue
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter,
});
  

export const uploadMiddleware = (req, res, next) => {
  upload.array("images", 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};
