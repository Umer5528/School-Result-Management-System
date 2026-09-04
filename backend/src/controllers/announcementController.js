const { Announcement } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { logActivity } = require('../services/activityLogService');

async function createAnnouncement(req, res) {
  const announcement = await Announcement.create({ ...req.body, createdBy: req.user._id });
  await logActivity({
    userId: req.user._id,
    action: 'ANNOUNCEMENT_CREATED',
    targetType: 'Announcement',
    targetId: announcement._id,
  });
  return ok(res, { announcement }, 'Announcement created', 201);
}

async function listAnnouncements(req, res) {
  const filter = {};
  // Non-admins only ever see currently active, in-window announcements.
  if (req.user.role === 'teacher') {
    const now = new Date();
    filter.active = true;
    filter.startDate = { $lte: now };
    filter.endDate = { $gte: now };
  }
  const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
  return ok(res, { announcements });
}

async function updateAnnouncement(req, res) {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw new AppError('Announcement not found', 404);

  Object.assign(announcement, req.body);
  await announcement.save();

  await logActivity({
    userId: req.user._id,
    action: 'ANNOUNCEMENT_UPDATED',
    targetType: 'Announcement',
    targetId: announcement._id,
  });

  return ok(res, { announcement }, 'Announcement updated');
}

async function deleteAnnouncement(req, res) {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw new AppError('Announcement not found', 404);
  await announcement.deleteOne();

  await logActivity({
    userId: req.user._id,
    action: 'ANNOUNCEMENT_DELETED',
    targetType: 'Announcement',
    targetId: announcement._id,
  });

  return ok(res, null, 'Announcement deleted');
}

module.exports = { createAnnouncement, listAnnouncements, updateAnnouncement, deleteAnnouncement };
