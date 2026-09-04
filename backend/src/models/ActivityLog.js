const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    // Optional -- most actions are attributable to a logged-in user, but
    // public subject submissions (Change Module 5) have no account at
    // all. Those events log with user: null and record the session/token
    // in metadata instead, per the "don't store unnecessary personal
    // information" requirement for public submissions.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    action: { type: String, required: true, trim: true }, // e.g. 'TEACHER_APPROVED'
    targetType: { type: String, trim: true }, // e.g. 'User', 'Result', 'Announcement'
    target: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

activityLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
