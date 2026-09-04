const { Draft } = require('../models');
const { ok } = require('../utils/apiResponse');

async function getMyDraft(req, res) {
  const draft = await Draft.findOne({ createdBy: req.user._id }).lean();
  return ok(res, { draft: draft || null });
}

// Upsert — called on a debounce from the frontend every few seconds while
// the wizard is open. Last write wins; there is deliberately no
// versioning here since only one browser tab per teacher is expected to
// be editing a result at a time.
async function saveDraft(req, res) {
  const { step, basicInfo, subjects, students } = req.body;
  const draft = await Draft.findOneAndUpdate(
    { createdBy: req.user._id },
    { step, basicInfo, subjects, students },
    { upsert: true, new: true }
  );
  return ok(res, { draft, savedAt: new Date() });
}

async function deleteMyDraft(req, res) {
  await Draft.deleteOne({ createdBy: req.user._id });
  return ok(res, null, 'Draft discarded');
}

module.exports = { getMyDraft, saveDraft, deleteMyDraft };
