import mongoose from "mongoose";

function connectToDB() {
  const prodUri = process.env.MONGO_URI;
  const localUri = "mongodb://localhost:27017/flexo"; // fallback local URI for dev

  const uri =
    process.env.NODE_ENV === "production" || !process.env.NODE_ENV
      ? prodUri
      : localUri;

  mongoose
    .connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log(
        `Connected to MongoDB at ${
          process.env.NODE_ENV === "production" ? "production" : "development"
        } URI`
      );
    })
    .catch((err) => {
      console.error("Error connecting to MongoDB:", err);
      process.exit(1);
    });
}

export default connectToDB;
