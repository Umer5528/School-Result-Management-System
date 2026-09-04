const path = require('path');
// Resolve .env relative to this file, not to process.cwd() -- dotenv's
// default `require('dotenv').config()` only finds backend/.env when the
// process happens to be started from backend/. Running a script directly
// from a subfolder (e.g. `cd src/seed && node seedSuperAdmin.js`) would
// otherwise silently miss it.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // Fail fast at boot rather than deep inside a request handler
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: required('MONGO_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME,
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
};
