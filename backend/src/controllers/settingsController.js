const { Settings } = require('../models');
const { ok } = require('../utils/apiResponse');
const { logActivity } = require('../services/activityLogService');

// Settings changes rarely but is read on nearly every dashboard load, so a
// short-lived in-process cache avoids hitting Mongo on every request.
// Invalidated immediately on update — never serves stale data after a write.
let cache = { value: null, expiresAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function getOrCreateSettings() {
  if (cache.value && cache.expiresAt > Date.now()) {
    return cache.value;
  }
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
  return settings;
}

function invalidateCache() {
  cache = { value: null, expiresAt: 0 };
}

async function getSettings(req, res) {
  const settings = await getOrCreateSettings();
  return ok(res, { settings });
}

async function updateSettings(req, res) {
  const settings = await getOrCreateSettings();
  Object.assign(settings, req.body);
  await settings.save();
  invalidateCache();

  await logActivity({
    userId: req.user._id,
    action: 'SETTINGS_UPDATED',
    targetType: 'Settings',
    targetId: settings._id,
  });

  return ok(res, { settings }, 'Settings updated');
}

module.exports = { getSettings, updateSettings };
