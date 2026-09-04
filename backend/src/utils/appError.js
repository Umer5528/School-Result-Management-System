/**
 * Throw this anywhere in controllers/services for an error with a known
 * HTTP status and a message that is SAFE to show to the client.
 * Anything not an AppError is treated as an unexpected server error and
 * gets a generic message in production (see middleware/errorHandler.js).
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
