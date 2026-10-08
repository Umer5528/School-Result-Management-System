const mongoose = require('mongoose');

/**
 * Auto-saved whenever a teacher generates a result for a class/section —
 * NOT something the teacher fills in directly. Powers "load previous
 * setup" in the result wizard: next time they create a result for the
 * same class/section, subjects and the student roster (names/roll
 * numbers, no marks) can be pre-filled instead of retyped.
 */
const classProfileSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    class: { type: String, required: true, trim: true },
    group: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },

    schoolInfo: {
      name: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    subjects: [
      {
        name: { type: String, trim: true },
        totalMarks: Number,
        passingMarks: Number,
      },
    ],
    students: [
      {
        rollNumber: String,
        name: String,
        fatherName: String,
      },
    ],

    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One remembered profile per teacher per class/group/section.
classProfileSchema.index({ createdBy: 1, class: 1, group: 1, section: 1 }, { unique: true });

module.exports = mongoose.model('ClassProfile', classProfileSchema);
