const mongoose = require('mongoose');

/**
 * The permanent student master record. Independent of any exam — a
 * ResultSession later SNAPSHOTS a subset of these students (roll number,
 * name, father name) at creation time, so editing/deactivating a Student
 * here never rewrites a past exam's data. Same historical-integrity
 * principle as Result.teacherNameSnapshot.
 */
const studentSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rollNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true },
    class: { type: String, required: true, trim: true, index: true },
    section: { type: String, trim: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    studentId: { type: String, trim: true }, // optional admission/student ID
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// A teacher can't register the same roll number twice within one
// class/section/academic year.
studentSchema.index(
  { createdBy: 1, class: 1, section: 1, academicYear: 1, rollNumber: 1 },
  { unique: true }
);
studentSchema.index({ createdBy: 1, class: 1, section: 1, academicYear: 1 });

module.exports = mongoose.model('Student', studentSchema);
