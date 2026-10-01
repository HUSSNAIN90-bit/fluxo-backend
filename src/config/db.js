import mongoose from "mongoose";
import { isLive } from "../store/env.js";

function connectToDB() {
  const localUri = "mongodb://127.0.0.1:27017/fluxo";
  const uri = process.env.MONGO_URI || (isLive() ? "" : localUri);

  if (!uri) {
    console.error("MONGO_URI is required for a live deployment");
    process.exit(1);
  }

  mongoose
    .connect(uri)
    .then(async () => {
      console.log(
        `Connected to MongoDB at ${isLive() ? "live" : "development"} URI`
      );
      const { seedIfEmpty } = await import("../store/seed.js");
      await seedIfEmpty();
    })
    .catch((err) => {
      console.error("Error connecting to MongoDB:", err);
      process.exit(1);
    });
}

export default connectToDB;