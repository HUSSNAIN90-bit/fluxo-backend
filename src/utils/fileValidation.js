import { fileTypeFromBuffer } from "file-type";

export const validateFileContent = async (file) => {
  // checking actual filetype with binary data 
  const type = await fileTypeFromBuffer(file.buffer);

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!type || !allowed.includes(type.mime)) {
    throw new Error("Invalid file content");
  }
};