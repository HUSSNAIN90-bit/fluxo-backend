import nodemailer from "nodemailer";

const {
  EMAIL_USER,
  EMAIL_PASS,
} = process.env;

// Ensure required environment variables are set
if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error(
    "Missing EMAIL_USER or EMAIL_PASS in environment variables. Please configure your email credentials."
  );
}

// Configure Nodemailer transporter for Gmail SMTP (works with Render free tier)
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for port 465, false for other ports (587)
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Accept self-signed certificates (safer for free hosts, but consider more security for production)
  },
});

// Verify connection configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("Email server connection failed:", error);
  } else {
    console.log("Email server is ready to send messages via smtp.gmail.com");
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
    // Preview URL won't work with Gmail SMTP, but leaving here for API shape
    if (process.env.NODE_ENV !== "production") {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) {
        console.log("Preview URL: %s", preview);
      }
    }
    return info;
  } catch (err) {
    console.error("FULL EMAIL ERROR:", err);
    throw err;
  }
};

export { sendEmail };
