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
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
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

