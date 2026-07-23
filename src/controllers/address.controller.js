import Address from "../models/address.model.js";

/**
 * Add Address Controller
 *
 * Entry Point: POST /api/address/add
 *
 * Request Body:
 * {
 *   street: string,
 *  city: string,
 *  state: string,
 * postalCode: string,
 * country: string
 * }
 *
 */
const addAddress = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const data = req.validatedData;

    const newAddress = new Address({
      user: userId,
      street: data.street,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      phoneNumber: data.phoneNumber,
      type: data.type,
    });

    await newAddress.save();
    return res.status(201).json(newAddress);
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Addresses Controller
 *
 * Entry Point: GET /api/address/get
 */
const getAllAddresses = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const addresses = await Address.find({ user: userId });
    if (!addresses || addresses.length === 0) {
      return res.status(404).json({ message: "No addresses found" });
    }
    return res.json(addresses);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Address By ID Controller
 *
 * Entry Point: GET /api/address/get/:id
 */
const getAddressById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const address = await Address.findOne({ _id: id, user: userId });
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.status(200).json(address);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete Address Controller
 *
 * Entry Point: DELETE /api/address/delete/:id
 */
const deleteAddress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const address = await Address.findOneAndDelete({ _id: id, user: userId });
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }
    return res.status(200).json({ message: "Address deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export { addAddress, getAllAddresses, getAddressById, deleteAddress };
