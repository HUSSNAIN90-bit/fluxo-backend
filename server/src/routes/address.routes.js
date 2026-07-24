import express from "express";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import  validate  from "../middlewares/validate.middleware.js";
import { addressSchema } from "../validators/addressValidation.js";
import { addAddress ,getAllAddresses ,getAddressById,deleteAddress} from "../controllers/address.controller.js";
import {arcjetProtection} from "../middlewares/arcjet.middleware.js"

const router = express.Router();

router.use(arcjetProtection);

/**
 * Add Address Route
 *
 * @route /api/address/add
 */
router.post("/add", authenticateUser, validate(addressSchema), addAddress);

/**
 * Get All Addresses Route
 *
 * @route /api/address/get
 */
router.get("/get", authenticateUser, getAllAddresses);

/**
 * Get All addresses Route
 * 
 * @route /api/address/get
 */
router.get("/get/:id", authenticateUser, getAddressById);

/**
 * Delete Address Route
 *
 * @route /api/address/delete/:id
 */
router.delete("/delete/:id", authenticateUser, deleteAddress);

export default router;