// services/cloudinary.service.js
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};