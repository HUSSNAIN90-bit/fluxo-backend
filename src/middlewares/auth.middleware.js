import jwt from "jsonwebtoken";
import adminModel from "../models/admin.model.js";
import userModel from "../models/user.model.js";

const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Extract Bearer token from Authorization header or cookies
 * Priority: Authorization header > Cookies
 * Authorization header format: "Authorization: Bearer <token>"
 * Cookie names: userToken, adminToken
 */
const extractToken = (req, tokenType = "user") => {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new Error("Invalid Authorization header format. Use: Bearer <token>");
    }
    return parts[1];
  }

  // Fallback to cookies
  const cookieName = tokenType === "admin" ? "adminToken" : "userToken";
  const token = req.cookies?.[cookieName];
  
  if (!token) {
    return null;
  }

  return token;
};

/**
 * Authenticate Admin
 * Token sources (in order of priority):
 * 1. Authorization header: "Authorization: Bearer <token>"
 * 2. Cookie: adminToken
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        message: "Server configuration error: JWT_SECRET not set" 
      });
    }

    let token;
    try {
      token = extractToken(req, "admin");
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!token) {
      return res.status(401).json({ 
        message: "Authentication token missing. Use: Authorization: Bearer <token>"
      });
    }

    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token has expired" });
      }
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid or tampered token" });
      }
      throw error;
    }

    // Validate token payload
    if (!decoded.id || !decoded.username) {
      return res.status(401).json({ message: "Invalid token structure" });
    }

    // Find admin in database and validate access
    const admin = await adminModel.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ 
        message: "Admin not found. Access denied."
      });
    }

    // Attach admin info to request for use in controllers
    req.admin = admin;
    req.tokenPayload = decoded;
    req.userId = decoded.id;
    
    next();
  } catch (error) {
    console.error("Admin authentication error:", error);
    const statusCode = 500;
    res.status(statusCode).json({ 
      message: NODE_ENV === "production" ? "Authentication failed" : error.message
    });
  }
};

/**
 * Authenticate User
 * Token sources (in order of priority):
 * 1. Authorization header: "Authorization: Bearer <token>"
 * 2. Cookie: userToken
 */
const authenticateUser = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        message: "Server configuration error: JWT_SECRET not set" 
      });
    }

    let token;
    try {
      token = extractToken(req, "user");
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!token) {
      return res.status(401).json({ 
        message: "Authentication token missing. Use: Authorization: Bearer <token>"
      });
    }

    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token has expired" });
      }
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid or tampered token" });
      }
      throw error;
    }

    // Validate token payload
    if (!decoded.id || !decoded.email) {
      return res.status(401).json({ message: "Invalid token structure" });
    }

    // Find user in database and validate access
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        message: "User not found. Access denied."
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Email not verified. Please complete OTP verification.",
      });
    }

    // Attach user info to request for use in controllers
    req.user = user;
    req.tokenPayload = decoded;
    req.userId = decoded.id;
    
    next();
  } catch (error) {
    console.error("User authentication error:", error);
    const statusCode = 500;
    res.status(statusCode).json({ 
      message: NODE_ENV === "production" ? "Authentication failed" : error.message
    });
  }
};

/**
 * Authenticate Admin OR User
 * Token sources (in order of priority):
 * 1. Authorization header: "Authorization: Bearer <token>"
 * 2. Cookie: adminToken or userToken
 * Validates either admin or user token
 */
const authenticateAdminOrUser = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        message: "Server configuration error: JWT_SECRET not set" 
      });
    }

    let token;
    try {
      // Try to get token from header or cookies (either admin or user)
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
          throw new Error("Invalid Authorization header format. Use: Bearer <token>");
        }
        token = parts[1];
      } else {
        // Fallback to cookies - try both
        token = req.cookies?.adminToken || req.cookies?.userToken;
      }
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!token) {
      return res.status(401).json({ 
        message: "Authentication token missing. Use: Authorization: Bearer <token>"
      });
    }

    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token has expired" });
      }
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid or tampered token" });
      }
      throw error;
    }

    // Handle admin token
    if (decoded.type === "admin" && decoded.id && decoded.username) {
      const admin = await adminModel.findById(decoded.id);
      if (!admin) {
        return res.status(401).json({ 
          message: "Admin not found. Access denied."
        });
      }
      req.admin = admin;
      req.user = null;
      req.tokenPayload = decoded;
      req.userId = decoded.id;
      req.userType = "admin";
      return next();
    }

    // Handle user token
    if (decoded.type === "user" && decoded.id && decoded.email) {
      const user = await userModel.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ 
          message: "User not found. Access denied."
        });
      }
      if (!user.isEmailVerified) {
        return res.status(403).json({
          message: "Email not verified. Please complete OTP verification.",
        });
      }
      req.user = user;
      req.admin = null;
      req.tokenPayload = decoded;
      req.userId = decoded.id;
      req.userType = "user";
      return next();
    }

    // Invalid token type
    return res.status(401).json({ message: "Invalid token structure" });
  } catch (error) {
    console.error("Authentication error:", error);
    const statusCode = 500;
    res.status(statusCode).json({ 
      message: NODE_ENV === "production" ? "Authentication failed" : error.message
    });
  }
};

export { authenticateAdmin, authenticateUser, authenticateAdminOrUser };
