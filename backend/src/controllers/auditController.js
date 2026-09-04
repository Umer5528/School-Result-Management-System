const { ActivityLog } = require('../models');
const { ok } = require('../utils/apiResponse');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

async function listActivityLogs(req, res) {
  const { page, limit, skip } = paginationParams(req.query, { defaultLimit: 30, maxLimit: 200 });
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.userId) filter.user = req.query.userId;

  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('user', 'name email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return ok(res, paginatedResponse(items, total, page, limit));
}

module.exports = { listActivityLogs };
