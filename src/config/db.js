import mongoose from "mongoose";

function conectToDB() {
  // mongoose
  //   .connect(process.env.MONGO_URI)
  //   .then(() => {
  //     console.log("Server is connected to DB");
  //   })
  //   .catch((err) => {
  //     console.error("Error connecting to DB:", err);
  //     console.log("Attempting to connect to local MongoDB...");
      mongoose
        .connect("mongodb://localhost:27017/flexo")
        .then(() => {
          console.log("Connected to local MongoDB");
        })
        .catch((localErr) => {
          console.error("Error connecting to local MongoDB:", localErr);
          process.exit(1);
        });
    // });  
}

export default conectToDB;
