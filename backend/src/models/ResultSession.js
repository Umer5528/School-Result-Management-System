const mongoose = require('mongoose');

/**
 * Represents one exam from "teacher starts setting it up" through "all
 * subjects collected." A frozen snapshot of the selected students is
 * stored here (not a live ref) so editing/deleting a Student later never
 * corrupts an in-progress or completed session -- same historical-
 * integrity principle used by Result.
 *
 * Subject SUBMISSIONS (actual marks) live in a separate SubjectSubmission
 * collection, not here -- this document only holds the session's
 * configuration. Once every configured subject has a submission, the
 * teacher generates a Result (Change Module 8), which is the terminal,
 * already-existing artifact the rest of the app already knows how to
 * render/PDF/Excel.
 */
const sessionSubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
    // If true, the public submitter may adjust totalMarks/passingMarks
    // when submitting this subject; the teacher can still review/correct
    // it afterward (Change Module 7). If false, the submitter must use
    // the values configured here.
    allowSubmitterConfig: { type: Boolean, default: false },
  },
  { _id: true }
);

const sessionClassSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: '' },
    finalResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null },
  },
  { _id: true }
);

const sessionStudentSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true },
    class: { type: String, trim: true },
    section: { type: String, trim: true, default: '' },
    classId: { type: mongoose.Schema.Types.ObjectId },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  },
  { _id: false }
);

const resultSessionSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherNameSnapshot: { type: String, required: true },

    examName: { type: String, trim: true },
    examType: { type: String, required: true, trim: true },
    resultDate: { type: Date, required: true },
    academicYear: { type: String, required: true, trim: true },
    // Retained for backward compatibility; in multi-class exams this represents a summary/primary class
    class: { type: String, trim: true },
    section: { type: String, trim: true },
    // Multi-class support: an exam can include multiple classes
    classes: { type: [sessionClassSchema], default: [] },

    schoolInfo: {
      name: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
      logoUrl: { type: String, trim: true },
    },

    students: {
      type: [sessionStudentSchema],
      validate: { validator: (a) => a.length > 0, message: 'At least one student must be selected' },
    },
    subjects: {
      type: [sessionSubjectSchema],
      validate: { validator: (a) => a.length > 0, message: 'At least one subject is required' },
    },

    // A bulk convenience switch only now -- ACTIVE means subject-level
    // links have been provisioned (see SubjectSubmission); OFF means the
    // teacher has bulk-disabled everything not yet submitted. There is no
    // session-level submission token anymore -- every subject has its own
    // (see SubjectSubmission.submissionToken), which is the whole point
    // of this workflow change.
    submissionStatus: { type: String, enum: ['OFF', 'ACTIVE'], default: 'OFF', index: true },

    finalResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null },
  },
  { timestamps: true }
);

resultSessionSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('ResultSession', resultSessionSchema);
