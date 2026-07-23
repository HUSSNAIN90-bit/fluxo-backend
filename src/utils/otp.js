import crypto from "crypto";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000;

const generateOtp = () => {
  const max = 10 ** OTP_LENGTH;
  const otp = crypto.randomInt(0, max).toString().padStart(OTP_LENGTH, "0");
  return otp;
};

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const verifyOtpHash = (otp, hashedOtp) => {
  if (!otp || !hashedOtp) return false;
  const candidate = hashOtp(otp);
  if (candidate.length !== hashedOtp.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(candidate),
    Buffer.from(hashedOtp)
  );
};

export { generateOtp, hashOtp, verifyOtpHash, OTP_EXPIRY_MS };
