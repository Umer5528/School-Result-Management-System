const mongoose = require('mongoose');

/**
 * One in-progress result per teacher, autosaved from the frontend every
 * few seconds while they work through the creation wizard. Deleted the
 * moment the result is actually generated, or explicitly discarded by
 * the teacher. Deliberately loose/untyped on the payload — it mirrors
 * whatever shape the wizard's local state is in, since this is scratch
 * data, never the source of truth for a real result.
 */
const draftSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    step: { type: Number, default: 0 },
    basicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
    subjects: { type: mongoose.Schema.Types.Mixed, default: [] },
    students: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Draft', draftSchema);
