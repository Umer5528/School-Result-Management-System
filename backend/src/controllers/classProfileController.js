const { ClassProfile } = require('../models');
const { ok } = require('../utils/apiResponse');

/**
 * Called (fire-and-forget from the caller's perspective) right after a
 * result is successfully created, so the NEXT result for this class/
 * section can be pre-filled. Never blocks or fails result creation —
 * errors here are logged, not thrown.
 */
async function rememberClassProfile({ teacherId, class: className, section, schoolInfo, subjects, students }) {
  try {
    await ClassProfile.findOneAndUpdate(
      { createdBy: teacherId, class: className, section: section || '' },
      {
        schoolInfo,
        subjects: subjects.map((s) => ({ name: s.name, totalMarks: s.totalMarks, passingMarks: s.passingMarks })),
        // Marks are never remembered here — only who's in the class, so a
        // fresh exam starts with blank marks, not last exam's scores.
        students: students.map((s) => ({ rollNumber: s.rollNumber, name: s.name, fatherName: s.fatherName })),
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classProfile] failed to save:', err.message);
  }
}

// Quick-pick list for the wizard's "Recent Classes" shortcut.
async function listRecentClassProfiles(req, res) {
  const profiles = await ClassProfile.find({ createdBy: req.user._id })
    .sort({ lastUsedAt: -1 })
    .limit(10)
    .select('class section lastUsedAt subjects students')
    .lean();

  return ok(
    res,
    profiles.map((p) => ({
      class: p.class,
      section: p.section,
      lastUsedAt: p.lastUsedAt,
      subjectCount: p.subjects.length,
      studentCount: p.students.length,
    }))
  );
}

// Fetch the full remembered setup for one class/section to pre-fill the wizard.
async function getClassProfile(req, res) {
  const { class: className, section } = req.query;
  const profile = await ClassProfile.findOne({
    createdBy: req.user._id,
    class: className,
    section: section || '',
  }).lean();

  return ok(res, { profile: profile || null });
}

module.exports = { rememberClassProfile, listRecentClassProfiles, getClassProfile };
