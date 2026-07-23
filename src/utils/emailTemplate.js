import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PURPOSE_COPY = {
  signup: {
    title: "Verify your Fluxo account",
    subtitle: "Email verification",
    message:
      "Thanks for signing up. Enter the code below on the verification screen to activate your account.",
  },
  login: {
    title: "Your Fluxo login code",
    subtitle: "Login verification",
    message:
      "Use the code below to complete your login. It is valid for 5 minutes.",
  },
};

const loadRegisterOtpTemplate = async (otp, purpose = "signup") => {
  const copy = PURPOSE_COPY[purpose] ?? PURPOSE_COPY.signup;
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "registerEmailOtp.html"
  );
  const html = await fs.readFile(templatePath, "utf-8");

  return html
    .replace(/\{\{otp\}\}/g, otp)
    .replace(/\{\{title\}\}/g, copy.title)
    .replace(/\{\{subtitle\}\}/g, copy.subtitle)
    .replace(/\{\{message\}\}/g, copy.message);
};

const applyOrderPlaceholders = (html, orderData) => {
  const itemRows = orderData.items
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>₹${item.price.toFixed(2)}</td>
        <td>₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  html = html.replace(/\{\{#each items\}\}[\s\S]*?\{\{\/each\}\}/g, itemRows);

  const { shippingAddress } = orderData;
  const addressLine1 = shippingAddress.street;
  const deliveredDate = orderData.deliveredOn
    ? new Date(orderData.deliveredOn).toLocaleDateString()
    : new Date().toLocaleDateString();

  return html
    .replace(/\{\{orderId\}\}/g, orderData.orderId)
    .replace(/\{\{orderDate\}\}/g, new Date(orderData.createdAt).toLocaleDateString())
    .replace(/\{\{deliveredDate\}\}/g, deliveredDate)
    .replace(/\{\{orderStatus\}\}/g, orderData.status.charAt(0).toUpperCase() + orderData.status.slice(1))
    .replace(/\{\{customerName\}\}/g, orderData.customerName)
    .replace(/\{\{customerEmail\}\}/g, orderData.customerEmail)
    .replace(/\{\{customerPhone\}\}/g, orderData.customerPhone)
    .replace(/\{\{subtotal\}\}/g, `₹${orderData.subtotal.toFixed(2)}`)
    .replace(/\{\{shipping\}\}/g, `₹${orderData.shipping.toFixed(2)}`)
    .replace(/\{\{totalAmount\}\}/g, `₹${orderData.totalAmount.toFixed(2)}`)
    .replace(/\{\{shippingAddress\.line1\}\}/g, addressLine1)
    .replace(/\{\{shippingAddress\.city\}\}/g, shippingAddress.city)
    .replace(/\{\{shippingAddress\.state\}\}/g, shippingAddress.state)
    .replace(/\{\{shippingAddress\.zip\}\}/g, shippingAddress.postalCode)
    .replace(/\{\{shippingAddress\.country\}\}/g, shippingAddress.country)
    .replace(/\{\{orderLink\}\}/g, `${process.env.CLIENT_URL || "http://localhost:3000"}/orders/${orderData.orderId}`);
};

const loadOrderEmailTemplate = async (orderData, templateFile) => {
  const templatePath = path.join(__dirname, "..", "templates", templateFile);
  const html = await fs.readFile(templatePath, "utf-8");
  return applyOrderPlaceholders(html, orderData);
};

const loadOrderTemplate = (orderData) =>
  loadOrderEmailTemplate(orderData, "orderTemplate.html");

const loadOrderDeliveredTemplate = (orderData) =>
  loadOrderEmailTemplate(orderData, "orderDelivered.html");

export { loadRegisterOtpTemplate, loadOrderTemplate, loadOrderDeliveredTemplate };
