const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/appError');
const { User } = require('../models');

/**
 * Verifies the JWT and attaches the full, fresh user document to req.user.
 * Re-fetching from the DB (rather than trusting the token payload alone)
 * means a suspended/deactivated user is rejected immediately, not just
 * after their token expires.
 */
async function authenticateUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new AppError('Authentication required', 401);
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new AppError('Invalid or expired session. Please log in again.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('Account no longer exists', 401);
  }
  if (user.status !== 'approved') {
    throw new AppError('Your account is not active', 403);
  }

  req.user = user;
  next();
}

module.exports = { authenticateUser };
