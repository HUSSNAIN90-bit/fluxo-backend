import nodemailer from "nodemailer";

const {
  EMAIL_USER,
  EMAIL_PASS,
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
} = process.env;

if (!EMAIL_USER || (!EMAIL_PASS && (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN))) {
  throw new Error(
    "Missing email auth config. Set EMAIL_USER plus either EMAIL_PASS or CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN."
  );
}

const auth = EMAIL_PASS
  ? {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    }
  : {
      type: "OAuth2",
      user: EMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    };

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth,
});

transporter.verify((err, succ) => {
  if (err) {
    console.error("Error connecting to email server:", err);
    if (err.code === "EAUTH" && err.response?.includes("invalid_grant")) {
      console.error(
        "Gmail OAuth2 invalid_grant: refresh token may be expired, revoked, or invalid."
      );
    }
  } else {
    console.log("Email server is ready to send messages");
  }
});

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
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
  } catch (err) {
    throw new Error(
      `Error sending email: ${err.message}. Check Gmail credentials, OAuth2 refresh token, or app password.`
    );
  }
};

export { sendEmail };

