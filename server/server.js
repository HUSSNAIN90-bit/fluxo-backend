import "dotenv/config";
import conectToDB from "./src/config/db.js";
import app from "./src/app.js";

const PORT = process.env.PORT || 3000;

conectToDB();

app.listen(PORT, () => {
  console.log(`Express server is running on port ${PORT}`);
});
