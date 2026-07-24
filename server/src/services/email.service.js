import nodemailer from "nodemailer";

const {
  EMAIL_USER,
  EMAIL_PASS,
} = process.env;

// Simple mandatory check for credentials
if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error(
    "Missing EMAIL_USER or EMAIL_PASS in environment variables. Please configure your email credentials."
  );
}

// Create transporter for SMTP with Gmail using user & app password
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
// Verify connection configuration and log result
transporter.verify((error, success) => {
  if (error) {
    console.error("Email server connection failed:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
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
    console.error("FULL EMAIL ERROR:", err);
    throw err;
  }
};

export { sendEmail };
