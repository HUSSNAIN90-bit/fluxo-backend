import nodemailer from "nodemailer";

const {
  EMAIL_USER,
  EMAIL_PASS,
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
} = process.env;

// Simple mandatory check for credentials
if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error(
    "Missing EMAIL_USER or EMAIL_PASS in environment variables. Please configure your email credentials."
  );
}

// Create transporter for SMTP with Gmail using user & app password
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

/**
 * Sends an email using nodemailer SMTP transport.
 * @param {Object} param0
 * @param {string|string[]} param0.to - Recipient(s)
 * @param {string} param0.subject - Subject
 * @param {string} [param0.text] - Plain text content
 * @param {string} [param0.html] - HTML content
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log("Message sent: %s", info.messageId);
    // Only print the Preview URL in non-production (for development/testing)
    if (process.env.NODE_ENV !== "production") {
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }
    return info;
  } catch (err) {
    console.error(
      "Error sending email: %s\nCheck Gmail credentials, OAuth2 refresh token, or app password.",
      err.message
    );
    throw new Error(
      `Error sending email: ${err.message}. Check Gmail credentials, OAuth2 refresh token, or app password.`
    );
  }
};

export { sendEmail };
