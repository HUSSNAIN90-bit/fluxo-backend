import promotionModel from "../models/promotion.model.js";
import userModel from "../models/user.model.js";
import { sendEmail } from "./email.service.js";
import { loadPromotionEmailHtml } from "../utils/promotionEmailTemplate.js";

const getPromotionWithProducts = async (promotionId) => {
  const promotion = await promotionModel
    .findById(promotionId)
    .populate("products");

  if (!promotion) {
    throw new Error("Promotion not found");
  }

  return promotion;
};

const sendPromotionEmail = async (promotion) => {
  const populated = await getPromotionWithProducts(promotion._id);

  const subscribers = await userModel.find({
    isSubscribed: true,
    isEmailVerified: true,
  });

  if (!subscribers.length) {
    console.log("Promotion email skipped: no subscribed users.");
    return { sent: 0, failed: 0, skipped: true };
  }

  const html = await loadPromotionEmailHtml(
    populated,
    populated.products || []
  );
  const subject = `Fluxo — ${populated.title}`;
  const text = `${populated.title}\n\n${populated.description}\n\nShop now: ${process.env.CLIENT_URL || "http://localhost:3000"}/shop`;

  const results = await Promise.allSettled(
    subscribers.map((user) =>
      sendEmail({
        to: user.email,
        subject,
        text,
        html,
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  if (failed > 0) {
    console.error(
      `Promotion email: ${failed} of ${subscribers.length} sends failed.`
    );
  }

  console.log(
    `Promotion email "${populated.title}" sent to ${sent}/${subscribers.length} subscribers.`
  );

  return { sent, failed, skipped: false, total: subscribers.length };
};

export { sendPromotionEmail, getPromotionWithProducts };
