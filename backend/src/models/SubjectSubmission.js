const mongoose = require('mongoose');

/**
 * ONE PER-SUBJECT LINK RECORD. This is a significant change from the
 * previous design: a SubjectSubmission now exists from the moment a
 * session is activated (status: PENDING, holding that subject's unique
 * submissionToken) -- not just after marks are actually submitted. This
 * is required for "every subject has its own unique link": the token has
 * to identify one subject before anything has been entered against it.
 *
 * Existence of the doc is no longer the "submitted" signal -- `status`
 * is. PENDING = link is live, nothing submitted yet. SUBMITTED = marks
 * in. LOCKED = submitted and frozen against further edits. DISABLED =
 * teacher/admin has deliberately turned this specific link off (distinct
 * from the whole session being OFF).
 */
const submissionMarkSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, trim: true },
    obtained: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const classSubmissionSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    className: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'LOCKED'],
      default: 'PENDING',
    },
    marks: { type: [submissionMarkSchema], default: [] },
    submittedVia: { type: String, enum: ['public', 'teacher'], default: null },
    submittedAt: { type: Date, default: null },
  },
  { _id: true }
);

const subjectSubmissionSchema = new mongoose.Schema(
  {
    resultSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultSession', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subjectName: { type: String, required: true, trim: true },

    // Configured at provisioning time (session activation) from the
    // session's subject config; may later be corrected by the teacher, or
    // by the submitter themselves if allowSubmitterConfig is true.
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
    allowSubmitterConfig: { type: Boolean, default: false },

    // Multi-class tracking: one entry per class in the exam session
    classSubmissions: { type: [classSubmissionSchema], default: [] },

    // Retained for backward compatibility with single-class legacy sessions
    marks: { type: [submissionMarkSchema], default: [] },

    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'LOCKED', 'DISABLED'],
      default: 'PENDING',
      index: true,
    },

    // This IS the public link's identity -- never a Mongo ObjectId. See
    // utils/submissionToken.js for generation. Unique across the whole
    // system, not just within a session, since it's the sole public
    // lookup key.
    submissionToken: { type: String, required: true, unique: true, index: true },

    submittedVia: { type: String, enum: ['public', 'teacher'], default: null },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One link record per subject per session -- this is the structural
// guarantee behind "one link = one subject", not just an application check.
subjectSubmissionSchema.index({ resultSession: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('SubjectSubmission', subjectSubmissionSchema);
