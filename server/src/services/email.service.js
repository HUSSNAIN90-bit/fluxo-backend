import { Resend } from "resend";

const { RESEND_API_KEY } = process.env;

if (!RESEND_API_KEY) {
  throw new Error(
    "Missing RESEND_API_KEY in environment variables. Please configure your Resend API key.",
  );
}

const resend = new Resend(RESEND_API_KEY);

/**
 * Sends an email using Resend API.
 * @param {Object} param0
 * @param {string|string[]} param0.to - Recipient(s)
 * @param {string} param0.subject - Subject
 * @param {string} [param0.text] - Plain text content
 * @param {string} [param0.html] - HTML content
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    // Resend expects array or comma-separated string for recipients
    const recipients = Array.isArray(to) ? to : [to];
    const { data, error } = await resend.emails.send({
      from: "Fluxo <onboarding@resend.dev>",
      to: recipients,
      subject,
      text,
      html,
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log("Email sent:", data.id);
    return data;
  } catch (err) {
    console.error("FULL EMAIL ERROR:", err);
    throw err;
  }
};

export { sendEmail };
