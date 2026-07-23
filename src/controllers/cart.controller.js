import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";

/**
 * Helper to reliably resolve a variant by SKU, Variant ID, or fallback to the first variant.
 */
const findVariant = (product, sku) => {
  if (!product || !product.variants || product.variants.length === 0) return null;
  return (
    product.variants.find((v) => v.sku === sku) ||
    product.variants.find((v) => v._id?.toString() === sku) ||
    product.variants[0]
  );
};

const addToCart = async (req, res, next) => {
  try {
    const {
      productId,
      sku,
      quantity = 1,
    } = req.validatedData || req.body;
    const userId = req.user._id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const variant = findVariant(product, sku);
    if (!variant) {
      return res.status(404).json({ message: "Product variant not found" });
    }

    const effectiveSku = variant.sku || sku;

    if (quantity > variant.stock) {
      return res.status(400).json({
        message: "Not enough stock for selected variant",
        availableStock: variant.stock,
      });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, products: [] });
    }

    const existingProduct = cart.products.find(
      (p) => p._id.toString() === productId && (p.sku === effectiveSku || p.sku === sku)
    );

    if (existingProduct) {
      const newQuantity = existingProduct.quantity + quantity;
      if (newQuantity > variant.stock) {
        return res.status(400).json({
          message: "Not enough stock for selected variant",
          availableStock: variant.stock,
        });
      }
      existingProduct.quantity = newQuantity;
    } else {
      cart.products.push({
        _id: productId,
        variantId: variant._id,
        sku: effectiveSku,
        quantity,
      });
    }

    await cart.save();
    const populatedCart = await cart.populate("products._id");

    const cartObject = populatedCart.toObject();
    cartObject.products = cartObject.products.map((item) => {
      const p = item._id;
      const v = findVariant(p, item.sku);
      return {
        ...item,
        product: p,
        variant: v,
      };
    });

    return res.status(200).json(cartObject);
  } catch (error) {
    next(error);
  }
};

const quantityUpdate = async (req, res, next) => {
  try {
    const { productId, sku, quantity } = req.validatedData || req.body;
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const productItem = cart.products.find(
      (p) => p._id.toString() === productId && (p.sku === sku || !sku)
    );

    if (!productItem) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const variant = findVariant(product, sku || productItem.sku);
    if (!variant) {
      return res.status(404).json({ message: "Product variant not found" });
    }

    if (quantity > variant.stock) {
      return res.status(400).json({
        message: "Not enough stock for selected variant",
        availableStock: variant.stock,
      });
    }

    productItem.quantity = quantity;
    await cart.save();

    const populatedCart = await cart.populate("products._id");
    const cartObject = populatedCart.toObject();
    cartObject.products = cartObject.products.map((item) => {
      const p = item._id;
      const v = findVariant(p, item.sku);
      return {
        ...item,
        product: p,
        variant: v,
      };
    });

    return res.status(200).json(cartObject);
  } catch (error) {
    next(error);
  }
};

const getCart = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId }).populate("products._id");

    if (!cart) {
      return res.status(200).json({
        user: userId,
        products: [],
        items: 0,
      });
    }

    const cartObject = cart.toObject();
    cartObject.products = cartObject.products.map((item) => {
      const product = item._id;
      const variant = findVariant(product, item.sku);
      return {
        ...item,
        product,
        variant,
      };
    });

    return res.status(200).json(cartObject);
  } catch (error) {
    next(error);
  }
};

const removeFromCart = async (req, res, next) => {
  try {
    const { productId, sku } = req.validatedData || req.body;
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.products = cart.products.filter(
      (p) => !(p._id.toString() === productId && (p.sku === sku || !sku))
    );
    await cart.save();
    const populatedCart = await cart.populate("products._id");

    const cartObject = populatedCart.toObject();
    cartObject.products = cartObject.products.map((item) => {
      const p = item._id;
      const v = findVariant(p, item.sku);
      return {
        ...item,
        product: p,
        variant: v,
      };
    });

    return res.status(200).json(cartObject);
  } catch (err) {
    next(err);
  }
};

export { addToCart, quantityUpdate, getCart, removeFromCart };
