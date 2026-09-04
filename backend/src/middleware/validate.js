const AppError = require('../utils/appError');

/**
 * Wraps a Zod schema as Express middleware. Runs before the controller so
 * controllers never see malformed input.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new AppError('Validation failed', 400, details);
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
