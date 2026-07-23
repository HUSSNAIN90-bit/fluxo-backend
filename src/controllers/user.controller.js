import userModel from "../models/user.model.js";
import { userGenerateToken } from "../utils/tokenGenerator.js";
import { assignOtpToUser } from "../services/otp.service.js";
import { verifyOtpHash } from "../utils/otp.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import cloudinary from "../config/cloudinary.js";

const cookieOptions = {
  maxAge: 15 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

const issueAuthCookie = (res, user) => {
  const token = userGenerateToken(user);
  res.cookie("userToken", token, cookieOptions);
};

const clearOtpFields = (user) => {
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  user.otpPurpose = undefined;
};

/**
 * Create User Controller
 *
 * Entry Point: POST /api/auth/users
 * Sends OTP; token is issued after verify-otp.
 */
const createUser = async (req, res, next) => {
  const { name, email, password, phoneNumber } = req.body;

  try {
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const newUser = new userModel({
      name,
      email,
      password,
      phoneNumber,
      isEmailVerified: false,
    });
    await newUser.save();

    await assignOtpToUser(newUser, "signup");

    return res.status(201).json({
      message: "Account created. Verification OTP sent to your email.",
      requiresVerification: true,
      purpose: "signup",
      email,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Login User Controller
 *
 * Entry Point: POST /api/auth/users/login
 * Validates credentials, sends OTP; token is issued after verify-otp.
 */
const loginUser = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await userModel.findOne({ email }).select("+password +otp");
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    await assignOtpToUser(user, "login");

    const message = user.isEmailVerified
      ? "Login OTP sent to your email."
      : "Login OTP sent to your email. Enter the code to verify your account and sign in.";

    return res.json({
      message,
      requiresVerification: true,
      purpose: "login",
      email,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Change User Password
 *
 * Entry Point: POST /api/auth/users/change-password
 */
const changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const user = await userModel
      .findOne({ _id: req.userId })
      .select("+password");
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    user.password = await user.hashPassword(newPassword);
    await user.save();
    return logoutUser(req, res, next);
  } catch (err) {
    next(err);
  }
};

/**
 * Change User Profile
 *
 * Entery Point: PUT /api/auth/users/change-profile
 */
const changeUserProfile = async (req, res, next) => {
  try {
    const user = await userModel.findOne(req.userId);

    if (!user)
      return res.status(404).json({
        status: "fail",
        message: "User Not found",
      });

    const profileImage = await uploadToCloudinary(
      req.files.map((file) => {
        return file.buffer;
      }),
    );
    try {
      user.profileImage = profileImage;
      user.save();
      return res
        .status(200)
        .json({ status: "success", message: "profile image changed" });
    } catch (err) {
      await cloudinary.uploader.destroy(profileImage.public_id);
      throw new Error(`Error changing ProfileImage: ${err}`);
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Verify OTP Controller
 *
 * Entry Point: POST /api/auth/users/verify-otp
 *
 * Request Body:
 * { email: string, otp: string, purpose: "signup" | "login" }
 */
const verifyOtp = async (req, res, next) => {
  const { email, otp, purpose: requestedPurpose } = req.body;

  try {
    const user = await userModel
      .findOne({ email })
      .select("+otp +otpExpiresAt +otpPurpose");

    if (!user) {
      return res.status(400).json({ message: "Invalid email or OTP" });
    }

    if (!user.otp || !user.otpExpiresAt || !user.otpPurpose) {
      return res.status(400).json({
        message: "No active OTP. Please sign up or log in again.",
      });
    }

    const purpose = user.otpPurpose;
    if (requestedPurpose && requestedPurpose !== purpose) {
      return res.status(400).json({
        message: "Invalid verification request",
        purpose,
      });
    }

    if (user.otpExpiresAt < new Date()) {
      clearOtpFields(user);
      await user.save();
      return res.status(400).json({ message: "OTP has expired" });
    }

    if (!verifyOtpHash(otp, user.otp)) {
      return res.status(400).json({ message: "Invalid email or OTP" });
    }

    clearOtpFields(user);

    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
    }

    await user.save();
    issueAuthCookie(res, user);

    return res.json({
      message:
        purpose === "signup"
          ? "Email verified successfully"
          : "Login successful",
      purpose,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get user Profile Controller
 *
 * Entry Point: GET /api/auth/users/profile
 */
const getUserProfile = async (req, res, next) => {
  try {
    const { id } = req.user;
    const user = await userModel.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user });
  } catch (err) {
    next(err);
  }
};

/** Logout User Controller
 *
 * Entry Point: POST /api/auth/users/logout
 */
const logoutUser = async (req, res, next) => {
  try {
    res.clearCookie("userToken");
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

export {
  createUser,
  loginUser,
  verifyOtp,
  getUserProfile,
  logoutUser,
  changePassword,
  changeUserProfile,
};
