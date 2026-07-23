import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { adminGenerateToken } from "../utils/tokenGenerator.js";

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minLength: 6,
    },
  },
  { timestamps: true },
);

adminSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return;
  } catch (err) {
    console.error("AdminSchema Error hashing password:", err);
    throw err;
  }
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const adminModel = mongoose.model("Admin", adminSchema);

export default adminModel;
