const mongoose = require('mongoose');

// Singleton document — always fetched/updated via findOne(); the app
// guarantees only one Settings doc ever exists (enforced in the service
// layer in a later module, not here).
const settingsSchema = new mongoose.Schema(
  {
    systemName: { type: String, default: 'School Result Management System' },
    schoolName: { type: String, trim: true },
    adminEmail: { type: String, trim: true },
    adminPhone: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    defaultAcademicYear: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
