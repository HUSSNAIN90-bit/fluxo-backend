import promotionModel from "../models/promotion.model.js";
import productModel from "../models/product.model.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import { validateFileContent } from "../utils/fileValidation.js";
import { sendPromotionEmail } from "../services/promotion.service.js";

/**
 * Create New Promotion Controller
 *
 * Entry Point: POST /api/promotions/create
 */
const createNewPromotion = async (req, res, next) => {
  const data = req.validatedData;
  try {
    const productsIds = (data.products || []).map(async (p) => {
      if (p.productId) {
        const product = await productModel.findById(p.productId);
        if (!product) {
          throw new Error(`Product with id ${p.productId} not found`);
        }
        if (
          !Array.isArray(data.categories) ||
          !data.categories.includes(product.category)
        ) {
          throw new Error(
            `Product category ${product.category} does not match promotion categories`,
          );
        }
        return product._id;
      }
      throw new Error("Product id is required for adding product in promotion");
    });

    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
      if (req.files.length > 10) {
        return res.status(400).json({ message: "Max 10 images allowed" });
      }

      for (const file of req.files) {
        await validateFileContent(file);
      }

      const uploads = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file.buffer)),
      );

      uploadedImages = uploads.map((img) => ({
        url: img.secure_url,
        public_id: img.public_id,
      }));
    }

    if (data.startDate >= data.endDate) {
      return res
        .status(400)
        .json({ message: "Start date must be before end date" });
    }
    if (data.startDate < new Date() || data.endDate < new Date()) {
      return res.status(400).json({ message: "Dates must be in the future" });
    }

    let promotion;

    try {
      data.products = await Promise.all(productsIds);
      data.bannerImages = uploadedImages;
      promotion = new promotionModel(data);
      await promotion.save();
    } catch (err) {
      await Promise.all(
        uploadedImages.map((img) => cloudinary.uploader.destroy(img.public_id)),
      );
      throw new Error(`Error creating promotion: ${err.message}`);
    }

    let emailResult = { sent: 0, failed: 0, skipped: true };
    try {
      emailResult = await sendPromotionEmail(promotion);
    } catch (emailErr) {
      console.error("Promotion created but email failed:", emailErr.message);
    }

    return res.status(201).json({
      promotion,
      email: emailResult,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Send promotion email to subscribed users
 *
 * Entry Point: POST /api/promotions/:id/send-email
 */
const sendPromotionEmailById = async (req, res, next) => {
  try {
    const promotion = await promotionModel.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    const emailResult = await sendPromotionEmail(promotion);

    returnres.json({
      message: emailResult.skipped
        ? "No subscribed users to email"
        : "Promotion email sent",
      email: emailResult,
    });
  } catch (err) {
    next(err);
  }
};

const getPromotionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const promotion = await promotionModel.findOne(id);
    if (!promotion)
      return res.status(404).json({
        status: "fail",
        message: "Promtion Not Found",
      });
    return res.status(200).json({ status: "fail", promotion });
  } catch (err) {
    next(err);
  }
};

const getCurrentPromotions = async (req, res, next) => {
  try {
    const promotions = await promotionModel.find({
      endDate: { $gt: new Date() },
    });
    return res.status(200).json({ status: "success", promotions });
  } catch (err) {
    next(err);
  }
};

const getPromotionsByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const promotions = await promotionModel.find({ category });
    return res.status(200).json({ status: "success", promotions });
  } catch (err) {
    next(err);
  }
};

const getPromotionsByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const promotions = await promotionModel.find({ productId });
    return res.status(200).json({ status: "success", promotions });
  } catch (err) {
    next(err);
  }
};

const getAllPromotions = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const cursor = req.query.cursor;

    let query = {};
    if (cursor) {
      query._id = { $gt: cursor };
    }

    const promotions = await promotionModel.find(query).sort({ _id: 1 }).limit(limit + 1);

    let nextCursor = null;
    if (promotions.length > limit) {
      // There are more results
      nextCursor = promotions[limit]._id;
      promotions.pop(); // Remove the extra item
    }

    return res.status(200).json({
      status: "success",
      promotions,
      nextCursor, // for infinite scrolling on the client
      hasMore: !!nextCursor,
    });
  } catch (err) {
    next(err);
  }
};

const renewPromotion = async (req, res, next) => {
  const promotionId = req.params.id;
  try {
    const promotion = await promotionModel.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }
    promotion.endDate = new Date(promotion.endDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    await promotion.save();
    returnres.status(200).json({ message: "Promotion renewed successfully" });
  }
  catch (err) {
    next(err);
  }
};

const deletePromotion = async (req, res, next) => {
  const promotionId = req.params.id;
  try {
    const promotion = await promotionModel.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }
    await promotionModel.findByIdAndDelete(promotionId);
    return res.status(200).json({ message: "Promotion deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export {
  createNewPromotion,
  sendPromotionEmailById,
  getPromotionById,
  renewPromotion,
  deletePromotion,
  getCurrentPromotions,
  getPromotionsByCategory,
  getPromotionsByProduct,
  getAllPromotions,
};
