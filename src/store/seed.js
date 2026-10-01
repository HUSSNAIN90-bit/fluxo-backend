import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import User from "../models/user.model.js";
import { CatalogProduct, Category } from "./models.js";
import { getSettings } from "./commerce.js";
import { isLive } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function skuFor(slug, size, color) {
  return `${slug}-${size}-${color}`.replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase();
}

export async function seedIfEmpty() {
  if (process.env.SEED === "0") return;
  await getSettings();
  const count = await CatalogProduct.countDocuments();
  if (count === 0) {
    const raw = JSON.parse(fs.readFileSync(path.join(here, "catalog.seed.json"), "utf8"));
    const categories = new Map();
    for (const [index, item] of raw.entries()) {
      categories.set(item.category, (categories.get(item.category) || 0) + 1);
      const variants = [];
      const per = Math.max(1, Math.floor((item.stock || 8) / Math.max(1, item.sizes.length * item.colors.length)));
      for (const color of item.colors) {
        for (const size of item.sizes) {
          variants.push({
            sku: skuFor(item.slug, size, color.name),
            size,
            color: color.name,
            colorHex: color.hex,
            price: item.price,
            stock: Math.max(per, 4),
          });
        }
      }
      await CatalogProduct.create({
        name: item.name,
        slug: item.slug,
        description: item.description,
        shortDescription: item.description.slice(0, 160),
        category: item.category,
        subcategory: item.collection || "",
        brand: "Fluxo",
        price: item.price,
        compareAt: item.compareAt,
        images: (item.images || []).map((url) => ({ url, alt: item.name })),
        thumbnail: item.images?.[0],
        variants,
        tags: [item.category, item.collection].filter(Boolean),
        status: "active",
        featured: index < 6,
        newArrival: Boolean(item.isNew),
        onSale: Boolean(item.onSale || item.compareAt),
        lowStockThreshold: 3,
        details: item.details || [],
        materials: item.materials || "",
        care: item.care || "",
        rating: item.rating || 0,
        reviews: (item.reviews || []).map(({ name, rating, title, body, date }) => ({
          name,
          rating,
          title,
          body,
          date,
        })),
      });
    }
    let sort = 0;
    for (const name of categories.keys()) {
      await Category.updateOne(
        { slug: name.toLowerCase() },
        { name, slug: name.toLowerCase(), enabled: true, sort: sort++ },
        { upsert: true },
      );
    }
  }

  const email = process.env.SEED_ADMIN_EMAIL || "admin@fluxo.test";
  const password = process.env.SEED_ADMIN_PASSWORD || (isLive() ? "" : "FluxoAdmin!234");
  if (!password) return;
  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({
      name: "Fluxo Admin",
      email,
      password,
      role: "admin",
      isEmailVerified: true,
    });
  }
}
