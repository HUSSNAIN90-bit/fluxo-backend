import aj from "../lib/arcjet.js";
import "dotenv/config";

import { isSpoofedBot } from "@arcjet/inspect";

export const arcjetProtection = async (req, res, next) => {
  if (!process.env.ARCJET_KEY) {
    return next();
  }
  try {
    const decision = await aj.protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res
          .status(429)
          .json({ error: "Too many requests. Please try again later." });
      } else if (decision.reason.isBot()) {
        return res
          .status(403)
          .json({ error: "Access denied. Bot traffic is not allowed." });
      } else {
        return res
          .status(403)
          .json({ error: "Access denied by security policy." });
      }
    }
    if (decision.results.some(isSpoofedBot)) {
      return res.status(403).json({
        error: "Spoofed bot detected",
        message: "Malicious activity detected.",
      });
    }
    next();
  } catch (err) {
    console.error("Arcjet middleware error:", err);
    next();
  }
};
