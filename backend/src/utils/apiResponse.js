/**
 * Consistent success envelope for every endpoint.
 * Keeping this uniform means the frontend never has to guess the shape
 * of a successful response.
 */
function ok(res, data = null, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

module.exports = { ok };
