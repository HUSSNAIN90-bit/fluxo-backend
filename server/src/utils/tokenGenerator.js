import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET exists
if (!JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not set. Using default secret (NOT SECURE FOR PRODUCTION)");
}

/**
 * Generate token for admin
 * Token includes: id, username, type, issued-at time
 * Expires in 24 hours
 */
const adminGenerateToken = (admin) => {
    if (!admin || !admin._id || !admin.username) {
        throw new Error("Invalid admin data for token generation");
    }

    const payload = {
        id: admin._id.toString(),
        username: admin.username,
        type: "admin",
        iat: Math.floor(Date.now() / 1000), // Issued at timestamp
    };

    const secret = JWT_SECRET || "your_jwt_secret";
    const options = {
        expiresIn: "24h",
        algorithm: "HS256",
    };

    try {
        return jwt.sign(payload, secret, options);
    } catch (error) {
        console.error("Error generating admin token:", error);
        throw error;
    }
};

/**
 * Generate token for user
 * Token includes: id, email, type, issued-at time
 * Expires in 15 days
 */
const userGenerateToken = (user) => {
    if (!user || !user._id || !user.email) {
        throw new Error("Invalid user data for token generation");
    }

    const payload = {
        id: user._id.toString(),
        email: user.email,
        type: "user",
        iat: Math.floor(Date.now() / 1000), // Issued at timestamp
    };

    const secret = JWT_SECRET || "your_jwt_secret";
    const options = {
        expiresIn: "15d",
        algorithm: "HS256",
    };

    try {
        return jwt.sign(payload, secret, options);
    } catch (error) {
        console.error("Error generating user token:", error);
        throw error;
    }
};


export { adminGenerateToken, userGenerateToken };