import express from "express";
import validate from "../middlewares/validate.middleware.js";
import {
  ProductSchema,
  UpdateProductValidation,
} from "../validators/productValidator.js";
import {
  createProduct,
  filterProducts,
  getAllProducts,
  getProductById,
  searchProducts,
  updateProduct,
} from "../controllers/porduct.controller.js";
import { authenticateAdmin, authenticateAdminOrUser } from "../middlewares/auth.middleware.js";
import { uploadMiddleware } from "../middlewares/upload.middleware.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection)

/**
 * Product Create Route
 *
 * POST /products/create
 */
router.post(
  "/create",
  authenticateAdmin,
  uploadMiddleware,
  validate(ProductSchema),
  createProduct,
);

/**
 * Fetch All Products Route
 *
 * GET /product/get
 *
 */
router.get("/get", getAllProducts);

/**
 * Product Get By ID Route
 * 
 * GET /products/get/:id
 * 
 */
router.get('/get/:id', getProductById);

/**
 * Product Update Route
 *
 * @route PUT /products/update/:id
 */
router.put(
  "/update/:id",
  authenticateAdmin,
  uploadMiddleware,
  validate(UpdateProductValidation),
  updateProduct,
);

/**
 * Filter Products
 * 
 * @route  GET /api/products/filter
 */
router.get("/filter", authenticateAdminOrUser , filterProducts);

/**
 * Search Products 
 * 
 * @route /api/products/:search
 */
router.get("/:search",  authenticateAdminOrUser , searchProducts);

/**
 * Product Delete Route
 *
 * @route DELETE /products/delete/:id
 */
router.delete("/delete/:id", authenticateAdmin, async (req, res, next) => {
  try {
    const productId = req.params.id;
    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    await product.remove();
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
