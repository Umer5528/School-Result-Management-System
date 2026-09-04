const bcrypt = require('bcryptjs');
const { User } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { signToken } = require('../utils/jwt');
const { logActivity } = require('../services/activityLogService');

const SALT_ROUNDS = 12;

// Fields safe to send to the client. Never spread the raw Mongoose doc —
// passwordHash must never leave the server.
function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    designation: user.designation,
    role: user.role,
    permissions: user.permissions,
    status: user.status,
    isPrimarySuperAdmin: user.isPrimarySuperAdmin,
    createdAt: user.createdAt,
  };
}

/**
 * Public self-registration. Always creates role=teacher, status=pending —
 * the request body can never select a different role or status, no
 * matter what fields it includes (registerSchema already strips anything
 * beyond name/email/designation/password/confirmPassword).
 */
async function register(req, res) {
  const { name, email, designation, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({
    name,
    email,
    designation,
    passwordHash,
    role: 'teacher',
    status: 'pending',
  });

  await logActivity({
    userId: user._id,
    action: 'TEACHER_REGISTERED',
    targetType: 'User',
    targetId: user._id,
  });

  return ok(
    res,
    { user: toPublicUser(user) },
    'Registration successful. Your account is awaiting administrator approval.',
    201
  );
}

const STATUS_MESSAGES = {
  pending: 'Your account is still awaiting administrator approval.',
  rejected: 'Your registration has been rejected. Please contact the administrator.',
  suspended: 'Your account has been suspended. Please contact the administrator.',
};

async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.status !== 'approved') {
    // Deliberately 403, not 401 — credentials were correct, access is not.
    throw new AppError(STATUS_MESSAGES[user.status] || 'Account is not active', 403);
  }

  const token = signToken(user);
  return ok(res, { token, user: toPublicUser(user) }, 'Login successful');
}

async function me(req, res) {
  return ok(res, { user: toPublicUser(req.user) });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Current password is incorrect', 400);
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  await logActivity({
    userId: user._id,
    action: 'PASSWORD_CHANGED_SELF',
    targetType: 'User',
    targetId: user._id,
  });

  return ok(res, null, 'Password changed successfully');
}

module.exports = { register, login, me, changePassword, toPublicUser, SALT_ROUNDS };
