import express from 'express';

import {createReview , getAllReviewsForProduct} from "../controllers/reviews.controller.js";
import { authenticateUser } from '../middlewares/auth.middleware.js';
import validate from "../middlewares/validate.middleware.js";
import { reviewSchema } from '../validators/reviews.validation.js';
import { uploadMiddleware } from '../middlewares/upload.middleware.js';
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router()

router.use(arcjetProtection)

/**
 * create a review
 * 
 * @route POST /api/reviews
 * 
 */
router.post("/:productId", authenticateUser, uploadMiddleware, validate(reviewSchema), createReview );

/**
 * get all reviews for a product
 * 
 * @route GET /api/reviews/:productId
 * 
 */
router.get("/:productId", getAllReviewsForProduct);

export default router;