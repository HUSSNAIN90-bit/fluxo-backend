import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const replacePlaceholders = (html, data) =>
  Object.entries(data).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{${key}\\}`, "g"), value ?? ""),
    html
  );

const getProductPrice = (product) => {
  const prices = (product.variants || [])
    .map((v) => v.price)
    .filter((p) => typeof p === "number");
  return prices.length ? Math.min(...prices) : 0;
};

const getProductImage = (product) =>
  product.images?.[0]?.url ||
  product.variants?.find((v) => v.images?.[0]?.url)?.images?.[0]?.url ||
  "";

const formatPrice = (amount) => `$${Number(amount).toFixed(2)}`;

const applyDiscount = (price, type, value) => {
  if (type === "percentage") {
    return Math.max(0, price * (1 - value / 100));
  }
  return Math.max(0, price - value);
};

const buildProductsHtml = (products, baseUrl, type, value) => {
  if (!products?.length) {
    return `<p style="text-align:center;color:#666666;font-size:14px;">Browse our collection at <a href="${baseUrl}/shop" style="color:#667eea;">${baseUrl}/shop</a></p>`;
  }

  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const pair = products.slice(i, i + 2);
    const cells = pair
      .map((product) => {
        const price = getProductPrice(product);
        const salePrice = applyDiscount(price, type, value);
        const imageUrl = getProductImage(product);
        const productUrl = `${baseUrl}/products/${product._id}`;

        return `<td align="center" style="padding:12px;width:50%;vertical-align:top;">
          <a href="${productUrl}" style="text-decoration:none;color:#000000;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${product.name}" width="220" style="max-width:100%;height:auto;display:block;margin:0 auto 10px;border-radius:4px;" />` : ""}
            <p style="margin:0;font-size:14px;font-weight:600;">${product.name}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#666666;">
              ${price > salePrice ? `<span style="text-decoration:line-through;margin-right:6px;">${formatPrice(price)}</span>` : ""}
              <span style="color:#667eea;font-weight:700;">${formatPrice(salePrice)}</span>
            </p>
          </a>
        </td>`;
      })
      .join("");

    const filler = pair.length === 1 ? '<td width="50%"></td>' : "";
    rows.push(`<tr>${cells}${filler}</tr>`);
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;">${rows.join("")}</table>`;
};

const buildDiscountLabel = (type, value) =>
  type === "percentage"
    ? `Save up to ${value}% off`
    : `Save up to ${formatPrice(value)}`;

const loadPromotionEmailHtml = async (promotion, products) => {
  const baseUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "promotionEmailTemplate.html"
  );
  const template = await fs.readFile(templatePath, "utf-8");

  const imageUrl =
    promotion.bannerImages?.[0]?.url ||
    getProductImage(products[0]) ||
    `${baseUrl}/placeholder.png`;

  const data = {
    title: promotion.title,
    description: promotion.description,
    discountLabel: buildDiscountLabel(promotion.type, promotion.value),
    imageUrl,
    bannerLink: `${baseUrl}/shop`,
    link1: `${baseUrl}/shop`,
    link1Text: "Shop",
    link2: `${baseUrl}/shop?category=clothing`,
    link2Text: "Clothing",
    link3: `${baseUrl}/shop?category=electronics`,
    link3Text: "Electronics",
    link4: `${baseUrl}/`,
    link4Text: "Home",
    productsHtml: buildProductsHtml(
      products,
      baseUrl,
      promotion.type,
      promotion.value
    ),
  };

  return replacePlaceholders(template, data);
};

export { loadPromotionEmailHtml };
