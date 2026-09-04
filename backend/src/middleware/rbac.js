const AppError = require('../utils/appError');

/**
 * Restrict a route to one or more roles.
 * Usage: requireRole('super_admin') or requireRole('super_admin', 'assistant_admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('You do not have permission to perform this action', 403);
    }
    next();
  };
}

/**
 * An Assistant Admin must have the named permission flag; a Super Admin
 * always passes (implicit full access); a Teacher never passes.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) throw new AppError('Authentication required', 401);
    if (user.role === 'super_admin') return next();
    if (user.role === 'assistant_admin' && (user.permissions || []).includes(permission)) {
      return next();
    }
    throw new AppError('You do not have permission to perform this action', 403);
  };
}

/**
 * Guards owner-level actions. Checks isPrimarySuperAdmin, not role, so
 * nothing else in the system can ever be treated as "the owner" even if a
 * bug elsewhere grants someone the super_admin role.
 */
function requirePrimarySuperAdmin(req, res, next) {
  if (!req.user || !req.user.isPrimarySuperAdmin) {
    throw new AppError('This action is restricted to the system owner', 403);
  }
  next();
}

/**
 * Blocks any action that targets the primary Super Admin account —
 * used on routes like approve/reject/suspend/role-change/delete so an
 * Assistant Admin (or a buggy Super Admin-facing form) can never touch
 * the owner account via its ID.
 */
function forbidTargetingPrimarySuperAdmin(getTargetUser) {
  return async (req, res, next) => {
    const target = await getTargetUser(req);
    if (target && target.isPrimarySuperAdmin) {
      throw new AppError('The system owner account cannot be modified through this action', 403);
    }
    req._targetUser = target;
    next();
  };
}

module.exports = {
  requireRole,
  requirePermission,
  requirePrimarySuperAdmin,
  forbidTargetingPrimarySuperAdmin,
};
