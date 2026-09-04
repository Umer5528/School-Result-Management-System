const env = require('../config/env');

/**
 * Single place where every thrown/rejected error in the app ends up
 * (thanks to express-async-errors). Never leaks stack traces or raw
 * driver errors to the client in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // Known Mongoose/driver error shapes -> friendly messages
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already exists` : 'Duplicate value';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired session. Please log in again.';
  }

  if (!err.isOperational && statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error('[unexpected error]', err);
    if (env.nodeEnv === 'production') {
      message = 'Internal server error';
      details = undefined;
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
