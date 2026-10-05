const mongoose = require("mongoose");

const env = require("./env");

let cachedConnection = null;

async function connectDB() {
  mongoose.set("strictQuery", true);

  if (cachedConnection) {
    return cachedConnection;
  }

  if (mongoose.connection.readyState === 1) {
    cachedConnection = mongoose.connection;
    return cachedConnection;
  }

  try {
    cachedConnection = await mongoose.connect(env.mongoUri);

    console.log("[db] MongoDB connected");

    return cachedConnection;
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    throw err;
  }
}

module.exports = connectDB;
