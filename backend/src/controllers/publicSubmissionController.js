const { SubjectSubmission, ResultSession } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubmissionMarks } = require('../services/resultCalculationService');
const { logActivity } = require('../services/activityLogService');

/**
 * The ONLY way any function here ever locates anything is by exact
 * submissionToken match on a SubjectSubmission -- which identifies
 * exactly one subject within exactly one session. There is no listing,
 * searching, or enumeration endpoint in this controller, and critically,
 * there is no "browse other subjects in this session" capability either
 * -- a Mathematics link can never reveal that English/Physics/etc. even
 * exist, let alone access them. This is the structural enforcement of
 * "one link = one result session + one subject."
 */
async function findLinkByToken(token) {
  const link = await SubjectSubmission.findOne({ submissionToken: token });
  if (!link) {
    throw new AppError('Invalid submission link', 404);
  }
  if (link.status === 'DISABLED') {
    throw new AppError('This subject submission link is currently disabled by the administrator', 403);
  }
  if (link.status === 'SUBMITTED' || link.status === 'LOCKED') {
    throw new AppError(`${link.subjectName} has already been submitted`, 409);
  }
  // link.status === 'PENDING' from here on -- the only accessible state.

  const session = await ResultSession.findById(link.resultSession);
  if (!session || session.finalResultId) {
    // The session was deleted or already finalized after this link was
    // provisioned -- treat exactly like an invalid link, no extra detail.
    throw new AppError('Invalid submission link', 404);
  }

  return { link, session };
}

// One call does verify + subject info + roster -- there's no separate
// "browse" step anymore since the token already identifies the exact
// subject. Never exposes any other subject in the session.
async function getSubmissionInfo(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);

  return ok(res, {
    session: {
      examName: session.examName,
      examType: session.examType,
      resultDate: session.resultDate,
      academicYear: session.academicYear,
      class: session.class,
      section: session.section,
      schoolInfo: session.schoolInfo,
    },
    subject: {
      name: link.subjectName,
      totalMarks: link.totalMarks,
      passingMarks: link.passingMarks,
      allowSubmitterConfig: link.allowSubmitterConfig,
    },
    students: session.students.map((s) => ({ rollNumber: s.rollNumber, name: s.name, fatherName: s.fatherName })),
  });
}

async function submitMarks(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);

  let totalMarks = link.totalMarks;
  let passingMarks = link.passingMarks;
  if (link.allowSubmitterConfig) {
    if (req.body.totalMarks !== undefined) totalMarks = req.body.totalMarks;
    if (req.body.passingMarks !== undefined) passingMarks = req.body.passingMarks;
    if (passingMarks > totalMarks) {
      throw new AppError('Passing marks cannot exceed total marks', 400);
    }
  }

  validateSubmissionMarks(session.students, req.body.marks, totalMarks);
  for (const mark of req.body.marks) {
    if (mark.obtained < 0 || mark.obtained > totalMarks) {
      throw new AppError(`Marks for roll number ${mark.rollNumber} must be between 0 and ${totalMarks}`, 400);
    }
  }

  // Atomic check-and-set: only transitions if the link is still PENDING
  // at the moment of write. This is the real defense against a
  // near-simultaneous double submission slipping past the earlier check
  // in findLinkByToken -- a plain findOne-then-save has a race window,
  // this does not.
  const updated = await SubjectSubmission.findOneAndUpdate(
    { _id: link._id, status: 'PENDING' },
    {
      $set: {
        totalMarks,
        passingMarks,
        marks: req.body.marks,
        status: 'SUBMITTED',
        submittedVia: 'public',
        submittedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!updated) {
    throw new AppError(`${link.subjectName} has already been submitted`, 409);
  }

  await logActivity({
    userId: null,
    action: 'SUBJECT_SUBMITTED_PUBLIC',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: link.subjectId, subjectName: link.subjectName, studentCount: req.body.marks.length },
  });

  return ok(res, null, `${link.subjectName} submitted successfully`);
}

module.exports = { getSubmissionInfo, submitMarks };
