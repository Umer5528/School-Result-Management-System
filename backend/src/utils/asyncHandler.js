// Not strictly required since express-async-errors is loaded globally,
// but kept for explicitness in a few places and for easy testing in isolation.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = asyncHandler;
