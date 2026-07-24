import { sendEmail } from "./email.service.js";
import { loadRegisterOtpTemplate } from "../utils/emailTemplate.js";
import { generateOtp, hashOtp, OTP_EXPIRY_MS } from "../utils/otp.js";

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

  await sendEmail({
    to: user.email,
    subject,
    text: `Your verification code is ${otp}. It expires in 5 minutes.`,
    html,
  });
};

export { assignOtpToUser };
