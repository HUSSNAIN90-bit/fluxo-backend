import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { seedIfEmpty } from "./seed.js";

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/fluxo";

await mongoose.connect(uri);
await seedIfEmpty();
console.log("Seed complete");
await mongoose.disconnect();
