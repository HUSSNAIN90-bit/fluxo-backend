import reviewsModel from "../models/reviews.model.js";
import productModel from "../models/product.model.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import { validateFileContent } from "../utils/fileValidation.js";

const createReview = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.validatedData;
    const userId = req.user._id;
    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }
    let uploadedImages = [];

    // 🔹 1. Check files
    if (req.files && req.files.length > 0) {
      if (req.files.length > 10) {
        return res.status(400).json({ message: "Max 10 images allowed" });
      }

      // 🔥 2. Validate real content
      for (const file of req.files) {
        await validateFileContent(file);
      }

      // 🔥 3. Upload all images
      const uploads = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file.buffer)),
      );

      uploadedImages = uploads.map((img) => ({
        url: img.secure_url,
        public_id: img.public_id,
      }));
    }

    try {
      const review = await reviewsModel.create({
        rating,
        comment,
        user: userId,
        product: productId,
        images: uploadedImages,
      });
      return res.status(201).json({
        message: "Review created successfully",
        review,
      });
    } catch (err) {
      await Promise.all(
        uploadedImages.map((img) => cloudinary.uploader.destroy(img.public_id)),
      );
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

const getAllReviewsForProduct = async (req, res, next) => {
    try{
        const {productId} = req.params;
        const reviews = await reviewsModel.find({product: productId});
        return res.status(200).json({
            message: "Reviews fetched successfully",
            reviews,
        });
  } catch (err) {
    next(err);
  }
};

export { createReview, getAllReviewsForProduct };
