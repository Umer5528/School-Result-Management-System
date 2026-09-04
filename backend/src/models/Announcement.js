const mongoose = require('mongoose');

const TYPES = ['information', 'warning', 'maintenance', 'important'];

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: TYPES, default: 'information' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ active: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
module.exports.TYPES = TYPES;
