const { ResultSession, Student, SubjectSubmission, Result } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubjects, validateSubmissionMarks, calculateResult } = require('../services/resultCalculationService');
const { generateSubmissionToken } = require('../utils/submissionToken');
const { logActivity } = require('../services/activityLogService');
const { attachSubmissionStatus, attachSubmissionCounts, buildSubmissionView } = require('../services/resultSessionViewService');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

// Every route here is scoped to the requesting teacher's own sessions.
function ownerFilter(req, extra = {}) {
  return { createdBy: req.user._id, ...extra };
}

async function getSessionOrThrow(req) {
  const session = await ResultSession.findOne(ownerFilter(req, { _id: req.params.id }));
  if (!session) throw new AppError('Result session not found', 404);
  return session;
}

// Generates a token guaranteed unique against every SubjectSubmission in
// the system (the token is the sole public lookup key, so uniqueness has
// to be global, not per-session).
async function generateUniqueSubjectToken() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateSubmissionToken();
    // eslint-disable-next-line no-await-in-loop
    const clash = await SubjectSubmission.findOne({ submissionToken: candidate }).select('_id').lean();
    if (!clash) return candidate;
  }
  throw new AppError('Could not generate a unique submission link, please try again', 500);
}

/**
 * Step 1+2+3 of the wizard submitted together: exam details, the
 * students selected from the teacher's own roster, and subject config.
 * Creates the session in submissionStatus: OFF -- no per-subject links
 * exist yet. The teacher still has to explicitly activate it (a
 * separate, deliberate action) to provision them.
 */
async function createSession(req, res) {
  const { studentIds, subjects, ...meta } = req.body;

  const students = await Student.find({ _id: { $in: studentIds }, createdBy: req.user._id, active: true });
  if (students.length !== studentIds.length) {
    throw new AppError('One or more selected students were not found in your roster', 400);
  }

  validateSubjects(subjects);

  const session = await ResultSession.create({
    ...meta,
    createdBy: req.user._id,
    teacherNameSnapshot: req.user.name,
    students: students.map((s) => ({ rollNumber: s.rollNumber, name: s.name, fatherName: s.fatherName })),
    subjects,
    submissionStatus: 'OFF',
  });

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_SESSION_CREATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { class: session.class, examType: session.examType, students: students.length, subjects: subjects.length },
  });

  return ok(res, { session }, 'Result session created', 201);
}

async function listSessions(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = ownerFilter(req);
  if (req.query.status) filter.submissionStatus = req.query.status;

  const [items, total] = await Promise.all([
    ResultSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ResultSession.countDocuments(filter),
  ]);
  await attachSubmissionCounts(items);

  return ok(res, paginatedResponse(items, total, page, limit));
}

async function getSession(req, res) {
  const session = await getSessionOrThrow(req);
  const sessionObj = await attachSubmissionStatus(session);
  return ok(res, { session: sessionObj });
}

/**
 * "Turn On Result Submission" -- now provisions ONE SubjectSubmission
 * (status PENDING, its own unique token) per subject in the session.
 * This is a one-time provisioning step: once active, individual subject
 * links are managed one at a time (disable/enable/regenerate/lock), not
 * as a single shared code. Refuses to re-provision an already-active
 * session so a stray double-click can't silently mint a second set of
 * tokens per subject (the unique (resultSession, subjectId) index would
 * reject it anyway, but the friendly guard is clearer).
 */
async function activateSession(req, res) {
  const session = await getSessionOrThrow(req);
  if (session.finalResultId) {
    throw new AppError('This result has already been finalized and cannot be reactivated', 400);
  }
  if (session.submissionStatus === 'ACTIVE') {
    throw new AppError('Submission is already active. Manage individual subject links below.', 400);
  }

  const existing = await SubjectSubmission.find({ resultSession: session._id }).select('subjectId').lean();
  const alreadyProvisioned = new Set(existing.map((s) => s.subjectId.toString()));

  const created = [];
  for (const subject of session.subjects) {
    if (alreadyProvisioned.has(subject._id.toString())) continue; // e.g. re-activating after a bulk deactivate
    // eslint-disable-next-line no-await-in-loop
    const token = await generateUniqueSubjectToken();
    // eslint-disable-next-line no-await-in-loop
    const doc = await SubjectSubmission.create({
      resultSession: session._id,
      subjectId: subject._id,
      subjectName: subject.name,
      totalMarks: subject.totalMarks,
      passingMarks: subject.passingMarks,
      allowSubmitterConfig: subject.allowSubmitterConfig,
      submissionToken: token,
      status: 'PENDING',
    });
    created.push(doc);
  }

  // Re-activating after a bulk deactivate: bring previously auto-disabled
  // (never-submitted) links back to PENDING rather than minting new ones.
  await SubjectSubmission.updateMany(
    { resultSession: session._id, status: 'DISABLED' },
    { $set: { status: 'PENDING' } }
  );

  session.submissionStatus = 'ACTIVE';
  await session.save();

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_SESSION_ACTIVATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectsProvisioned: created.length },
  });

  const sessionObj = await attachSubmissionStatus(session);
  return ok(res, { session: sessionObj }, 'Result submission is now active. Each subject has its own link below.');
}

/**
 * Bulk convenience action: disables every subject link that hasn't been
 * submitted yet. Submitted/locked subjects are untouched -- their data
 * is never deleted, and they were never publicly accessible for further
 * submission anyway once SUBMITTED.
 */
async function deactivateSession(req, res) {
  const session = await getSessionOrThrow(req);

  await SubjectSubmission.updateMany(
    { resultSession: session._id, status: 'PENDING' },
    { $set: { status: 'DISABLED' } }
  );

  session.submissionStatus = 'OFF';
  await session.save();

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_SESSION_DEACTIVATED',
    targetType: 'ResultSession',
    targetId: session._id,
  });

  const sessionObj = await attachSubmissionStatus(session);
  return ok(res, { session: sessionObj }, 'Result submission turned off. Already-submitted subjects are unaffected.');
}

async function findSubjectLink(req) {
  const session = await getSessionOrThrow(req);
  const subject = session.subjects.id(req.params.subjectId);
  if (!subject) throw new AppError('Subject not found in this result session', 404);

  const link = await SubjectSubmission.findOne({ resultSession: session._id, subjectId: subject._id });
  if (!link) {
    throw new AppError('This subject\'s submission link has not been generated yet. Activate result submission first.', 404);
  }
  return { session, subject, link };
}

async function disableSubjectLink(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  if (link.status !== 'PENDING') {
    throw new AppError('Only a pending (not yet submitted) subject link can be disabled', 400);
  }
  link.status = 'DISABLED';
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_LINK_DISABLED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name },
  });

  return ok(res, { link }, `${subject.name} link disabled`);
}

async function enableSubjectLink(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  if (link.status !== 'DISABLED') {
    throw new AppError('Only a disabled subject link can be re-enabled', 400);
  }
  link.status = 'PENDING';
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_LINK_ENABLED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name },
  });

  return ok(res, { link }, `${subject.name} link re-enabled`);
}

/**
 * "If the Teacher believes a link has been shared with the wrong
 * person" -- revokes the old token immediately (anyone still holding it
 * gets "invalid link") and issues a new one. Restricted to links that
 * haven't been submitted yet; once a subject is done, there's nothing
 * left for a link to protect.
 */
async function regenerateSubjectToken(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  if (!['PENDING', 'DISABLED'].includes(link.status)) {
    throw new AppError('A link can only be regenerated while it is pending or disabled', 400);
  }

  const oldToken = link.submissionToken;
  link.submissionToken = await generateUniqueSubjectToken();
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_LINK_TOKEN_REGENERATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, oldToken, newToken: link.submissionToken },
  });

  return ok(res, { link }, `New link generated for ${subject.name}. The previous link no longer works.`);
}

/**
 * Lets the teacher open one submitted subject and see the actual marks --
 * joined against the session's own student snapshot. Computed pass/fail
 * here is for display only; the authoritative calculation happens once
 * at final result generation.
 */
async function getSubjectSubmission(req, res) {
  const { subject, link } = await findSubjectLink(req);
  if (!['SUBMITTED', 'LOCKED'].includes(link.status)) {
    throw new AppError(`${subject.name} has not been submitted yet`, 404);
  }
  const session = await getSessionOrThrow(req);
  return ok(res, { submission: buildSubmissionView(session, link) });
}

/**
 * Teacher-side correction -- "Edit/correct marks", "Change Total Marks",
 * "Change Passing Marks". Unlike the public flow, the teacher may freely
 * change totalMarks/passingMarks regardless of allowSubmitterConfig;
 * that flag only gates what an anonymous public submitter can touch.
 */
async function editSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  if (link.status === 'LOCKED') throw new AppError('Unlock this subject before editing its marks', 400);
  if (link.status !== 'SUBMITTED') throw new AppError('This subject has not been submitted yet', 400);

  const totalMarks = req.body.totalMarks ?? link.totalMarks;
  const passingMarks = req.body.passingMarks ?? link.passingMarks;
  if (passingMarks > totalMarks) throw new AppError('Passing marks cannot exceed total marks', 400);
  validateSubmissionMarks(session.students, req.body.marks, totalMarks);

  const before = { totalMarks: link.totalMarks, passingMarks: link.passingMarks, marks: link.marks };

  link.totalMarks = totalMarks;
  link.passingMarks = passingMarks;
  link.marks = req.body.marks;
  link.submittedVia = 'teacher';
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_MARKS_EDITED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, before },
  });

  return ok(res, { submission: link }, 'Marks updated');
}

/**
 * "Reopen a subject" -- clears its marks and returns it to PENDING so
 * the SAME link can be used again (the teacher can separately regenerate
 * the token too, if they specifically want a fresh link). A full
 * snapshot of what's being cleared is written to the audit log first.
 */
async function reopenSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  if (link.status === 'LOCKED') throw new AppError('Unlock this subject before reopening it', 400);
  if (link.status !== 'SUBMITTED') throw new AppError('This subject has not been submitted yet', 400);

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_REOPENED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, clearedMarks: link.marks, clearedAt: link.submittedAt },
  });

  link.marks = [];
  link.status = 'PENDING';
  link.submittedAt = null;
  link.submittedVia = null;
  await link.save();

  return ok(res, { link }, `${subject.name} reopened. The same link can be used to submit it again.`);
}

async function setSubjectLock(req, res, locked) {
  const { session, subject, link } = await findSubjectLink(req);
  if (locked && link.status !== 'SUBMITTED') throw new AppError('Only a submitted subject can be locked', 400);
  if (!locked && link.status !== 'LOCKED') throw new AppError('This subject is not locked', 400);

  link.status = locked ? 'LOCKED' : 'SUBMITTED';
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: locked ? 'SUBJECT_LOCKED' : 'SUBJECT_UNLOCKED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name },
  });

  return ok(res, { link }, locked ? `${subject.name} locked` : `${subject.name} unlocked`);
}

const lockSubject = (req, res) => setSubjectLock(req, res, true);
const unlockSubject = (req, res) => setSubjectLock(req, res, false);

/**
 * "Generate Final Result" -- refuses to run until every configured
 * subject is SUBMITTED or LOCKED (never PENDING or DISABLED). Rebuilds
 * subjects/marks from the SubjectSubmission link documents and hands
 * everything to the SAME calculateResult() the original direct-entry
 * wizard uses -- one calculation engine regardless of which workflow
 * produced the raw marks.
 */
async function generateFinalResult(req, res) {
  const session = await getSessionOrThrow(req);
  if (session.finalResultId) {
    throw new AppError('This result session has already been finalized', 400);
  }

  const links = await SubjectSubmission.find({ resultSession: session._id }).lean();
  const done = links.filter((l) => l.status === 'SUBMITTED' || l.status === 'LOCKED');
  if (done.length < session.subjects.length) {
    const pending = session.subjects.length - done.length;
    throw new AppError(
      `Final result cannot be generated yet. ${pending} subject${pending === 1 ? '' : 's'} still pending.`,
      400
    );
  }

  const subjects = done.map((l) => ({ name: l.subjectName, totalMarks: l.totalMarks, passingMarks: l.passingMarks }));

  const marksByRollAndSubject = new Map();
  done.forEach((l) => {
    l.marks.forEach((m) => {
      marksByRollAndSubject.set(`${m.rollNumber}|${l.subjectName}`, m.obtained);
    });
  });

  const students = session.students.map((s) => ({
    rollNumber: s.rollNumber,
    name: s.name,
    fatherName: s.fatherName,
    marks: subjects.map((subj) => ({
      subject: subj.name,
      obtained: marksByRollAndSubject.get(`${s.rollNumber}|${subj.name}`) ?? 0,
    })),
  }));

  const { students: calculatedStudents, statistics } = calculateResult({
    subjects,
    students,
    expectedStrength: session.students.length,
  });

  const result = await Result.create({
    createdBy: req.user._id,
    teacherNameSnapshot: session.teacherNameSnapshot,
    sourceSessionId: session._id,
    schoolInfo: session.schoolInfo,
    class: session.class,
    section: session.section,
    academicYear: session.academicYear,
    examType: session.examType,
    examName: session.examName,
    resultDate: session.resultDate,
    subjects,
    students: calculatedStudents,
    statistics,
  });

  session.finalResultId = result._id;
  session.submissionStatus = 'OFF';
  await session.save();

  await logActivity({
    userId: req.user._id,
    action: 'FINAL_RESULT_GENERATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { resultId: result._id, students: statistics.totalStudents },
  });

  return ok(res, { result }, 'Final result generated successfully', 201);
}

module.exports = {
  createSession,
  listSessions,
  getSession,
  getSubjectSubmission,
  editSubjectSubmission,
  reopenSubjectSubmission,
  lockSubject,
  unlockSubject,
  disableSubjectLink,
  enableSubjectLink,
  regenerateSubjectToken,
  activateSession,
  deactivateSession,
  generateFinalResult,
};
