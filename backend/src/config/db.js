const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(env.mongoUri);
    // eslint-disable-next-line no-console
    console.log('[db] MongoDB connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
