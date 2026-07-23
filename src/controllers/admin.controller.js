import adminModel from "../models/admin.model.js";
import { adminGenerateToken } from "../utils/tokenGenerator.js";

/**
 * Admin Register Controller
 *
 * Enter Point: POST /admin/register
 *
 * Request Body:
 * {
 * "username": "admin",
 * "password": "admin123"
 * }
 *
 */
const registerAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the admin already exists
    const existingAdmin = await adminModel.findOne({ username });

    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }
    // Create a new admin
    const newAdmin = new adminModel({ username, password });

    await newAdmin.save();
    return res.status(201).json({ message: "Admin registered successfully" });
  } catch (error) {
    console.error("Error registering adminController:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Admin Login Controller
 *
 * Enter Point: POST /admin/login
 *
 * Request Body:
 * {
 * "username": "admin",
 * "password": "admin123"
 * }
 *
 */
const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await adminModel.findOne({ username });

    if (!admin) {
      return res.status(400).json({ message: "Admin not found" });
    }
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = adminGenerateToken(admin);

    res.cookie("adminToken", token, {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    return res.json({ message: "Login successful" });
  } catch (err) {
    console.error("Error logging in adminController:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export { registerAdmin, loginAdmin };
