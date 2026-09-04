const { ActivityLog } = require('../models');

/**
 * Fire-and-forget audit logging. Never throws into the calling request —
 * a logging failure must not block the underlying business action.
 */
async function logActivity({ userId, action, targetType, targetId, metadata }) {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      targetType,
      target: targetId,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[activityLog] failed to record entry:', err.message);
  }
}

module.exports = { logActivity };
