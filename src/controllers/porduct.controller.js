import productModel from "../models/product.model.js";
import promotionModel from "../models/promotion.model.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import { validateFileContent } from "../utils/fileValidation.js";

// Util: Return if product is "new" (e.g. within last 7 days, change as needed)
function isProductNew(product) {
  if (!product.createdAt) return false;
  const now = new Date();
  const daysNew = 7;
  const productDate = new Date(product.createdAt);
  return (now - productDate) / (1000 * 60 * 60 * 24) <= daysNew;
}

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
 * Now includes isOnSale, discount (amount), and isNew for each product.
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

    // Fetch paginated products with createdAt field
    const products = await productModel
      .find({})
      .select("name images variants createdAt")
      .skip(skip)
      .limit(limit);

    const formatted = products.map((product) => {
      const variant = product.variants[0];
      const promo = promotions.find((p) => p.products.includes(product._id));

      let finalPrice = variant?.price ?? 0;
      let isOnSale = false;
      let discount = 0;
      let discountType = null;

      if (promo && variant) {
        isOnSale = true;
        discountType = promo.type;
        if (promo.type === "percentage") {
          discount = promo.value;
          finalPrice = variant.price - (variant.price * promo.value) / 100;
        } else {
          // flat discount
          discount = promo.value;
          finalPrice = variant.price - promo.value;
        }
      }

      // New logic: is the product "new" (within last X days)?
      const isNew = isProductNew(product);

      return {
        _id: product._id,
        name: product.name,
        image: product.images?.[0] || product.variants?.[0]?.images?.[0],
        originalPrice: variant?.price ?? 0,
        finalPrice: Math.max(finalPrice, 0),
        isOnSale,
        discount,
        discountType,
        isNew,
        variants: product.variants,
      };
    });

    // Sort so on-sale products come first, then new products
    formatted.sort((a, b) => {
      if (b.isOnSale !== a.isOnSale) return b.isOnSale - a.isOnSale;
      if (b.isNew !== a.isNew) return b.isNew - a.isNew;
      return 0;
    });

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
 * Now includes isOnSale, discount, discountType, and isNew
 */
const getProductById = async (req, res, next) => {
  const productId = req.params.id;

  try {
    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find active promotion for this product
    const now = new Date();
    const promotions = await promotionModel.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      products: product._id,
    });

    let isOnSale = false;
    let discount = 0;
    let discountType = null;
    let finalPrice = 0;

    const variant = product.variants[0];
    if (promotions.length > 0 && variant) {
      isOnSale = true;
      const promo = promotions[0];
      discountType = promo.type;
      if (promo.type === "percentage") {
        discount = promo.value;
        finalPrice = variant.price - (variant.price * promo.value) / 100;
      } else {
        discount = promo.value;
        finalPrice = variant.price - promo.value;
      }
    } else {
      finalPrice = variant?.price ?? 0;
    }

    const isNew = isProductNew(product);

    return res.json({
      success: true,
      data: {
        ...product.toObject(),
        isOnSale,
        discount,
        discountType,
        isNew,
        finalPrice: Math.max(finalPrice, 0),
        originalPrice: variant?.price ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Filter Products
 *
 * Enter Point:  GET /api/products/:filter
 * Now also adds isOnSale, discount, discountType, and isNew
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

    // === Infinite Scrolling Implementation ===

    // Parse page and limit, with defaults
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Optional sort (default newest first)
    let sort = { createdAt: -1 };
    if (req.query.sortBy && req.query.sortOrder) {
      sort = { [req.query.sortBy]: req.query.sortOrder === "asc" ? 1 : -1 };
    }

    // Get total matching products
    const total = await productModel.countDocuments(query);

    // Fetch products with skip and limit for infinite scroll
    const products = await productModel
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select("name images variants createdAt")
      .exec();

    // Find promotions for all these products
    const ids = products.map(p => p._id);
    const now = new Date();
    const promotions = await promotionModel.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      products: { $in: ids }
    });

    // Helper to find active promotion for given product
    const getPromo = (productId) => promotions.find(p => p.products.includes(productId));

    const formatted = products.map(product => {
      const variant = product.variants[0];
      const promo = getPromo(product._id);

      let isOnSale = false;
      let discount = 0;
      let discountType = null;
      let finalPrice = variant?.price ?? 0;

      if (promo && variant) {
        isOnSale = true;
        discountType = promo.type;
        if (promo.type === "percentage") {
          discount = promo.value;
          finalPrice = variant.price - (variant.price * promo.value) / 100;
        } else {
          discount = promo.value;
          finalPrice = variant.price - promo.value;
        }
      }

      const isNew = isProductNew(product);

      return {
        _id: product._id,
        name: product.name,
        image: product.images?.[0] || product.variants?.[0]?.images?.[0],
        originalPrice: variant?.price ?? 0,
        finalPrice: Math.max(finalPrice, 0),
        isOnSale,
        discount,
        discountType,
        isNew,
        variants: product.variants,
      };
    });

    // Sort so on-sale products come first, then new ones
    formatted.sort((a, b) => {
      if (b.isOnSale !== a.isOnSale) return b.isOnSale - a.isOnSale;
      if (b.isNew !== a.isNew) return b.isNew - a.isNew;
      return 0;
    });

    // Determine if there are more products after this batch
    const hasMore = skip + products.length < total;

    return res.json({
      success: true,
      data: formatted,
      page,
      limit,
      total,
      hasMore, // true if more products are available for infinite scroll
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Search Products
 *
 * Entry Point: /api/products/:search
 * Now includes isOnSale, discount, discountType, and isNew for each result.
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

    // Fetch paginated results with needed fields (including createdAt)
    const products = await productModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .select("name images variants createdAt")
      .sort({ createdAt: -1 })
      .exec();

    // Find promotions for these products
    const ids = products.map(p => p._id);
    const now = new Date();
    const promotions = await promotionModel.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      products: { $in: ids }
    });
    const getPromo = (productId) => promotions.find(p => p.products.includes(productId));

    // Format results for response
    const result = products.map(product => {
      const variant = product.variants[0];
      const promo = getPromo(product._id);

      let isOnSale = false;
      let discount = 0;
      let discountType = null;
      let finalPrice = variant?.price ?? 0;

      if (promo && variant) {
        isOnSale = true;
        discountType = promo.type;
        if (promo.type === "percentage") {
          discount = promo.value;
          finalPrice = variant.price - (variant.price * promo.value) / 100;
        } else {
          discount = promo.value;
          finalPrice = variant.price - promo.value;
        }
      }

      const isNew = isProductNew(product);

      return {
        _id: product._id,
        name: product.name,
        image: product.images?.[0] || product.variants?.[0]?.images?.[0],
        originalPrice: variant?.price ?? 0,
        finalPrice: Math.max(finalPrice, 0),
        isOnSale,
        discount,
        discountType,
        isNew,
        variants: product.variants,
      };
    });

    // Indicate if more products are available
    const hasMore = skip + products.length < total;

    // Optionally sort by isOnSale/new
    result.sort((a, b) => {
      if (b.isOnSale !== a.isOnSale) return b.isOnSale - a.isOnSale;
      if (b.isNew !== a.isNew) return b.isNew - a.isNew;
      return 0;
    });

    return res.json({
      success: true,
      data: result,
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
