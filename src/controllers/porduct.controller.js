import productModel from "../models/product.model.js";
import promotionModel from "../models/promotion.model.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import { validateFileContent } from "../utils/fileValidation.js";

/**
 * Create Product Controller
 *
 * Entry Point: POST /products/create
 *
 * Request Body:
 * {
 *   name: string,
 *   price: number,
 *   description: string
 * }
 *
 */
const createProduct = async (req, res, next) => {
  try {
    const data = req.validatedData;

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

    let product;

    try {
      if (data.variants?.length) {
        data.variants = data.variants.map((variant) => {
          let variantImages = [];

          if (variant.variantImageIndexes?.length) {
            variantImages = variant.variantImageIndexes
              .map((i) => uploadedImages[i])
              .filter(Boolean);
          }

          return {
            ...variant,
            images: variantImages,
          };
        });
      }

      if (data.productImagesIndex && data.productImagesIndex.length > 0) {
        data.images = data.productImagesIndex.map((i) => uploadedImages[i]);
      } else {
        data.images = [];
      }

      // 🔹 6. SAVE PRODUCT
      product = new productModel(data);
      await product.save();
    } catch (err) {
      // 🧹 CLEANUP (VERY IMPORTANT)
      await Promise.all(
        uploadedImages.map((img) => cloudinary.uploader.destroy(img.public_id)),
      );
      throw err;
    }

    // 🔹 7. SUCCESS RESPONSE
    return res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get All Products Route
 *
 * Entry Point: GET /products/get
 *
 */
const getAllProducts = async (req, res, next) => {
  try {
    const now = new Date();

    // Extract pagination parameters for infinite scrolling
    const page = parseInt(req.query.page, 10) || 1; // 1-based
    const limit = parseInt(req.query.limit, 10) || 20; // Default page size 20
    const skip = (page - 1) * limit;

    const promotions = await promotionModel.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    // Fetch total count for reference
    const total = await productModel.countDocuments();

    // Fetch paginated products
    const products = await productModel
      .find({})
      .select("name images variants")
      .skip(skip)
      .limit(limit);

    const formatted = products.map((product) => {
      const variant = product.variants[0];

      const promo = promotions.find((p) => p.products.includes(product._id));

      let finalPrice = variant?.price ?? 0;
      let isOnSale = false;

      if (promo && variant) {
        isOnSale = true;

        if (promo.type === "percentage") {
          finalPrice = variant.price - (variant.price * promo.value) / 100;
        } else {
          finalPrice = variant.price - promo.value;
        }
      }

      return {
        _id: product._id,
        name: product.name,
        image: product.images?.[0] || product.variants?.[0]?.images?.[0],
        originalPrice: variant?.price ?? 0,
        finalPrice: Math.max(finalPrice, 0),
        isOnSale,
        variants: product.variants,
      };
    });

    // Sort so on-sale products come first
    formatted.sort((a, b) => b.isOnSale - a.isOnSale);

    return res.json({
      success: true,
      data: formatted,
      page,
      limit,
      total,
      hasMore: skip + products.length < total,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * get Product By ID Route
 *
 * Entry Point: GET /products/get/:id
 */
const getProductById = async (req, res, next) => {
  const productId = req.params.id;

  try {
    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

/**
 * Filter Products
 *
 * Enter Point:  GET /api/products/:filter
 */
const filterProducts = async (req, res, next) => {
  try {
    // Build query object based on provided filters
    const query = {};

    // Category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Name filter (partial match, case-insensitive)
    if (req.query.name) {
      query.name = { $regex: req.query.name, $options: "i" };
    }

    // Fabric filter (for clothing)
    if (req.query.fabric) {
      query.fabric = req.query.fabric;
    }

    // Features filter (array match: product must have ALL features listed)
    if (req.query.features) {
      const featuresArr = Array.isArray(req.query.features)
        ? req.query.features
        : req.query.features.split(",");
      query["details.features"] = { $all: featuresArr };
    }

    // Material or materialDetails filter
    if (req.query.material) {
      query["details.materialDetails.material"] = req.query.material;
    }
    if (req.query.composition) {
      query["details.materialDetails.composition"] = req.query.composition;
    }

    // Filter by variant attributes: size, color, type, price range, stock
    const variantFilters = {};
    if (req.query.size) {
      variantFilters["variants.attributes.size"] = req.query.size;
    }
    if (req.query.variantColor || req.query.color) {
      variantFilters["variants.attributes.color"] =
        req.query.variantColor || req.query.color;
    }
    if (req.query.type) {
      variantFilters["variants.attributes.type"] = req.query.type;
    }
    // Price range filter (matches if any variant is within the range)
    if (req.query.minPrice || req.query.maxPrice) {
      const priceRange = {};
      if (req.query.minPrice) priceRange.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) priceRange.$lte = Number(req.query.maxPrice);
      variantFilters["variants.price"] = priceRange;
    }
    // Stock filter (matches if any variant has >= given stock)
    if (req.query.minStock) {
      variantFilters["variants.stock"] = { $gte: Number(req.query.minStock) };
    }

    // Color in general specifications.details
    if (req.query.productColor) {
      query["details.specifications.color"] = req.query.productColor;
    }

    // Merge variant filters into query
    Object.assign(query, variantFilters);

    // Infinite scrolling: support 'page' and 'limit' as usual,
    // return hasMore to indicate if more products are available on next scroll
    // 'page' is 1-based, frontend should request next page on scroll.
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Optional sort (default newest first)
    let sort = { createdAt: -1 };
    if (req.query.sortBy && req.query.sortOrder) {
      sort = { [req.query.sortBy]: req.query.sortOrder === "asc" ? 1 : -1 };
    }

    // Count total (for infinite scrolling)
    const total = await productModel.countDocuments(query);
    const products = await productModel
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .exec();

    // Infinite scroll relevant metadata
    const hasMore = skip + products.length < total;

    return res.json({
      success: true,
      data: products,
      page,
      limit,
      total,
      hasMore, // true if more products are available
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Search Products
 *
 * Entry Point: /api/products/:search
 */
const searchProducts = async (req, res, next) => {
  try {
    const { search } = req.params;

    // Parse infinite scroll params
    const page = parseInt(req.query.page, 10) || 1; // 1-based
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Perform text search on product name, description, and optionally category
    const searchRegex = new RegExp(search, "i");
    const query = {
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { "details.overview": searchRegex },
        { "details.features": searchRegex },
      ],
    };

    // Count matching products for hasMore logic
    const total = await productModel.countDocuments(query);

    // Fetch paginated results
    const products = await productModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .exec();

    // Indicate if more products are available
    const hasMore = skip + products.length < total;

    return res.json({
      success: true,
      data: products,
      page,
      limit,
      total,
      hasMore,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update Product Route
 *
 * Enter Point: PUT /products/update/:id
 *
 */
const updateProduct = async (req, res, next) => {
  const productId = req.params.id;
  const updateData = req.validatedData || req.body;
  let uploadedImages = [];

  try {
    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

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

    const dataToUpdate = { ...updateData };

    if (dataToUpdate.variants?.length) {
      dataToUpdate.variants = dataToUpdate.variants.map((variant) => {
        const variantImages = variant.variantImageIndexes?.length
          ? variant.variantImageIndexes
              .map((i) => uploadedImages[i])
              .filter(Boolean)
          : [];

        return {
          ...variant,
          images: variantImages,
        };
      });
    }

    if (dataToUpdate.productImagesIndex?.length) {
      dataToUpdate.images = dataToUpdate.productImagesIndex
        .map((i) => uploadedImages[i])
        .filter(Boolean);
    }

    const updatedProduct = await productModel
      .findByIdAndUpdate(
        productId,
        { $set: dataToUpdate },
        { new: true, runValidators: true, context: "query" },
      )
      .select("-__v");

    return res.json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    if (uploadedImages.length) {
      await Promise.all(
        uploadedImages.map((img) => cloudinary.uploader.destroy(img.public_id)),
      );
    }
    next(error);
  }
};

export {
  createProduct,
  getAllProducts,
  updateProduct,
  getProductById,
  filterProducts,
  searchProducts,
};
