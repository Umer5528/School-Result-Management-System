const { SubjectSubmission } = require('../models');

/**
 * Merges each subject's real link record (status, token, submitted info)
 * into a session's subjects array. Used by the teacher's own session view
 * and the admin's read-only equivalent (Change Module 11).
 *
 * IMPORTANT: unlike the pre-per-subject-link design, a SubjectSubmission
 * now exists for every activated subject regardless of whether it's been
 * submitted -- so "submitted" is judged by `status`, never by presence
 * of the doc.
 */
async function attachSubmissionStatus(sessionDoc) {
  const session = typeof sessionDoc.toObject === 'function' ? sessionDoc.toObject() : sessionDoc;

  const submissions = await SubjectSubmission.find({ resultSession: session._id })
    .select('subjectId status submissionToken submittedAt submittedVia')
    .lean();
  const byId = new Map(submissions.map((s) => [s.subjectId.toString(), s]));

  session.subjects = session.subjects.map((subj) => {
    const link = byId.get(subj._id.toString());
    return {
      ...subj,
      linkStatus: link?.status || null, // null = not yet provisioned (session never activated)
      submitted: link?.status === 'SUBMITTED' || link?.status === 'LOCKED',
      submissionToken: link?.submissionToken || null,
      submittedAt: link?.submittedAt || null,
      submittedVia: link?.submittedVia || null,
    };
  });
  session.submittedCount = submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'LOCKED').length;
  return session;
}

// Batched submittedCount for a list of sessions (avoids N+1 queries).
async function attachSubmissionCounts(sessions) {
  if (sessions.length === 0) return sessions;
  const counts = await SubjectSubmission.aggregate([
    {
      $match: {
        resultSession: { $in: sessions.map((s) => s._id) },
        status: { $in: ['SUBMITTED', 'LOCKED'] },
      },
    },
    { $group: { _id: '$resultSession', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((c) => [c._id.toString(), c.count]));
  sessions.forEach((s) => {
    s.submittedCount = countById.get(s._id.toString()) || 0;
  });
  return sessions;
}

/**
 * Builds the per-student inspection view for one submitted subject --
 * joined against the session's own frozen roster snapshot. Shared by the
 * teacher's inspect view and the admin's read-only equivalent.
 */
function buildSubmissionView(session, submission) {
  const nameByRoll = new Map(session.students.map((s) => [s.rollNumber, s]));
  const rows = submission.marks
    .map((m) => {
      const student = nameByRoll.get(m.rollNumber);
      return {
        rollNumber: m.rollNumber,
        name: student?.name || '(unknown)',
        fatherName: student?.fatherName,
        obtained: m.obtained,
        totalMarks: submission.totalMarks,
        status: m.obtained >= submission.passingMarks ? 'PASS' : 'FAIL',
      };
    })
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));

  return {
    subjectName: submission.subjectName,
    totalMarks: submission.totalMarks,
    passingMarks: submission.passingMarks,
    submittedAt: submission.submittedAt,
    submittedVia: submission.submittedVia,
    status: submission.status,
    rows,
  };
}

module.exports = { attachSubmissionStatus, attachSubmissionCounts, buildSubmissionView };
