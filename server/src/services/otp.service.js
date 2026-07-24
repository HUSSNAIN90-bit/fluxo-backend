import { sendEmail } from "./email.service.js";
import { loadRegisterOtpTemplate } from "../utils/emailTemplate.js";
import { generateOtp, hashOtp, OTP_EXPIRY_MS } from "../utils/otp.js";

/**
 * Assigns an OTP to the user and sends an email with error handling for email delivery.
 * Throws an error with detailed hint if email fails to send (for on-call visibility).
 * @param {Object} user - User document/model
 * @param {string} purpose - Purpose for OTP ("signup", "login", etc)
 */
const assignOtpToUser = async (user, purpose) => {
  const otp = generateOtp();
  user.otp = hashOtp(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  user.otpPurpose = purpose;
  await user.save();

  const html = await loadRegisterOtpTemplate(otp, purpose);
  const subject =
    purpose === "signup"
      ? "Verify your Fluxo account"
      : "Your Fluxo login code";

  try {
    await sendEmail({
      to: user.email,
      subject,
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html,
    });
  } catch (err) {
    console.error("FULL EMAIL ERROR:", err);
    throw err;
  }
};

export { assignOtpToUser };
