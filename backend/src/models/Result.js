const mongoose = require('mongoose');

// A single subject's mark for a single student. Kept flat (no ref) because
// this is a historical snapshot, not a live join — see subjectConfigSchema.
const studentMarkSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    obtained: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const studentResultSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true },
    marks: { type: [studentMarkSchema], required: true },

    // Everything below is SERVER-CALCULATED — see services/resultCalculationService.js.
    // Never trust a client-supplied value for any of these fields.
    totalObtained: { type: Number, required: true, min: 0 },
    totalMax: { type: Number, required: true, min: 0 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    // The calculated truth, per the per-subject pass/fail rule. NEVER
    // overwritten by a teacher override -- this is the permanent record
    // of what actually happened, which is exactly what still needs to
    // show as "Failed: Chemistry" even after a teacher overrides the
    // final outcome to PASS.
    status: { type: String, enum: ['PASS', 'FAIL'], required: true },
    failedSubjects: { type: [String], default: [] },
    position: { type: Number, required: true, min: 1 },

    // A teacher (or admin with MANAGE_RESULTS) may exercise discretion to
    // override the calculated status -- e.g. passing a student who failed
    // one subject by a small margin. null means "no override, use the
    // calculated status." The calculated status/failedSubjects above are
    // untouched either way, so the override is additive, auditable, and
    // reversible (setting this back to null restores the calculated result).
    overriddenStatus: { type: String, enum: ['PASS', 'FAIL'], default: null },
    overrideReason: { type: String, trim: true },
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overriddenAt: { type: Date, default: null },
  },
  { _id: false }
);

// The subject configuration as it existed at generation time — the source
// of truth for totalMax and pass/fail, frozen into the result forever.
const subjectConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const schoolInfoSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
  },
  { _id: false }
);

const statisticsSchema = new mongoose.Schema(
  {
    totalStudents: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    passPercentage: { type: Number, default: 0 },
    highest: { type: Number, default: 0 },
    lowest: { type: Number, default: 0 },
    average: { type: Number, default: 0 },
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Snapshot of the teacher's name at generation time — changing the
    // teacher's profile later must never rewrite historical results.
    teacherNameSnapshot: { type: String, required: true },
    // Set only for results generated from the new session/submission
    // workflow (Change Module 8) -- null for every result created through
    // the original direct "Create Result" wizard, which still works
    // exactly as before.
    sourceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultSession', default: null },
    sourceSessionClassId: { type: mongoose.Schema.Types.ObjectId, default: null },

    schoolInfo: { type: schoolInfoSchema, default: () => ({}) },

    class: { type: String, required: true, trim: true, index: true },
    group: { type: String, trim: true, default: '' },
    section: { type: String, trim: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    examType: { type: String, required: true, trim: true, index: true },
    examName: { type: String, trim: true },
    resultDate: { type: Date, required: true, index: true },

    subjects: {
      type: [subjectConfigSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one subject is required',
      },
    },
    students: {
      type: [studentResultSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one student is required',
      },
    },

    statistics: { type: statisticsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

resultSchema.index({ createdBy: 1, academicYear: 1, class: 1 });

module.exports = mongoose.model('Result', resultSchema);
