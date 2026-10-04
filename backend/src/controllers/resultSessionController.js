const mongoose = require('mongoose');
const { ResultSession, Student, SubjectSubmission, Result } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubjects, validateSubmissionMarks, calculateResult } = require('../services/resultCalculationService');
const { generateSubmissionToken } = require('../utils/submissionToken');
const { logActivity } = require('../services/activityLogService');
const {
  attachSubmissionStatus,
  attachSubmissionCounts,
  buildSubmissionView,
  normalizeClasses,
} = require('../services/resultSessionViewService');
const { rememberClassProfile } = require('./classProfileController');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

// Owner filter: allows owner or admins with manage permissions
function sessionAccessFilter(req, extra = {}) {
  const user = req.user;
  if (user.role === 'super_admin' || (user.role === 'assistant_admin' && (user.permissions || []).includes('MANAGE_RESULTS'))) {
    return extra;
  }
  return { createdBy: user._id, ...extra };
}

async function getSessionOrThrow(req) {
  const session = await ResultSession.findOne(sessionAccessFilter(req, { _id: req.params.id }));
  if (!session) throw new AppError('Result session not found', 404);
  return session;
}

// Generates a token guaranteed unique against every SubjectSubmission in the system
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
 * Creates one exam session for one or multiple classes at the same time.
 * Snapshots the selected students with class references.
 */
async function createSession(req, res) {
  const { studentIds, subjects, classes: inputClasses, ...meta } = req.body;

  const students = await Student.find({ _id: { $in: studentIds }, createdBy: req.user._id, active: true });
  if (students.length !== studentIds.length) {
    throw new AppError('One or more selected students were not found in your roster', 400);
  }

  validateSubjects(subjects);

  // Normalize classes
  let rawClasses = [];
  if (Array.isArray(inputClasses) && inputClasses.length > 0) {
    rawClasses = inputClasses.map((c) =>
      typeof c === 'string'
        ? { name: c.trim(), section: '' }
        : { name: c.name.trim(), section: (c.section || '').trim() }
    );
  } else if (meta.class) {
    rawClasses = [{ name: meta.class.trim(), section: (meta.section || '').trim() }];
  } else {
    const uniqueClassNames = [...new Set(students.map((s) => s.class))];
    rawClasses = uniqueClassNames.map((name) => ({ name, section: '' }));
  }

  const classDocs = rawClasses.map((c) => ({
    _id: new mongoose.Types.ObjectId(),
    name: c.name,
    section: c.section || '',
    finalResultId: null,
  }));

  const classMapByName = new Map(classDocs.map((c) => [c.name, c._id]));

  const sessionStudents = students.map((s) => ({
    rollNumber: s.rollNumber,
    name: s.name,
    fatherName: s.fatherName,
    class: s.class,
    section: s.section || '',
    classId: classMapByName.get(s.class) || classDocs[0]?._id,
    studentId: s._id,
  }));

  const session = await ResultSession.create({
    ...meta,
    createdBy: req.user._id,
    teacherNameSnapshot: req.user.name,
    class: classDocs.map((c) => c.name).join(', '),
    section: classDocs.length === 1 ? classDocs[0].section : '',
    classes: classDocs,
    students: sessionStudents,
    subjects,
    submissionStatus: 'OFF',
  });

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_SESSION_CREATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      classes: classDocs.map((c) => c.name),
      examType: session.examType,
      students: students.length,
      subjects: subjects.length,
    },
  });

  // Best-effort class profile remembering
  classDocs.forEach((c) => {
    const classStudentSubset = students.filter((s) => s.class === c.name);
    rememberClassProfile({
      teacherId: req.user._id,
      class: c.name,
      section: c.section,
      schoolInfo: session.schoolInfo,
      subjects,
      students: classStudentSubset,
    });
  });

  return ok(res, { session }, 'Result session created', 201);
}

async function listSessions(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = sessionAccessFilter(req);
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
 * Activates submission: provisions ONE SubjectSubmission per subject in the exam.
 * Each SubjectSubmission tracks classSubmissions for each class in the exam.
 */
async function activateSession(req, res) {
  const session = await getSessionOrThrow(req);
  if (session.finalResultId) {
    throw new AppError('This result has already been finalized and cannot be reactivated', 400);
  }
  if (session.submissionStatus === 'ACTIVE') {
    throw new AppError('Submission is already active. Manage individual subject links below.', 400);
  }

  const normClasses = normalizeClasses(session);
  const existing = await SubjectSubmission.find({ resultSession: session._id });
  const bySubjectId = new Map(existing.map((s) => [s.subjectId.toString(), s]));

  const created = [];
  for (const subject of session.subjects) {
    const existingDoc = bySubjectId.get(subject._id.toString());
    if (existingDoc) {
      // Re-activating: ensure all classes exist in classSubmissions
      normClasses.forEach((c) => {
        const found = existingDoc.classSubmissions?.find(
          (cs) => (cs.classId && cs.classId.toString() === c._id.toString()) || cs.className === c.name
        );
        if (!found) {
          existingDoc.classSubmissions.push({
            classId: c._id,
            className: c.name,
            section: c.section || '',
            status: 'PENDING',
            marks: [],
          });
        } else if (found.status === 'DISABLED') {
          found.status = 'PENDING';
        }
      });
      if (existingDoc.status === 'DISABLED') existingDoc.status = 'PENDING';
      // eslint-disable-next-line no-await-in-loop
      await existingDoc.save();
    } else {
      // Provision ONE unique link for this subject across all classes
      // eslint-disable-next-line no-await-in-loop
      const token = await generateUniqueSubjectToken();
      const classSubmissions = normClasses.map((c) => ({
        classId: c._id,
        className: c.name,
        section: c.section || '',
        status: 'PENDING',
        marks: [],
      }));
      // eslint-disable-next-line no-await-in-loop
      const doc = await SubjectSubmission.create({
        resultSession: session._id,
        subjectId: subject._id,
        subjectName: subject.name,
        totalMarks: subject.totalMarks,
        passingMarks: subject.passingMarks,
        allowSubmitterConfig: subject.allowSubmitterConfig,
        submissionToken: token,
        classSubmissions,
        status: 'PENDING',
      });
      created.push(doc);
    }
  }

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

async function deactivateSession(req, res) {
  const session = await getSessionOrThrow(req);

  await SubjectSubmission.updateMany(
    { resultSession: session._id, status: { $in: ['PENDING', 'IN_PROGRESS'] } },
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
    throw new AppError("This subject's submission link has not been generated yet. Activate result submission first.", 404);
  }
  return { session, subject, link };
}

async function disableSubjectLink(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
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
  const submittedClasses = (link.classSubmissions || []).filter(
    (cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED'
  );
  link.status =
    submittedClasses.length >= (session.classes?.length || 1)
      ? 'SUBMITTED'
      : submittedClasses.length > 0
      ? 'IN_PROGRESS'
      : 'PENDING';
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

async function regenerateSubjectToken(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
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
 * Inspection view: per subject or per class within a subject.
 */
async function getSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.query.classId || null;
  return ok(res, { submission: buildSubmissionView(session, link, classId) });
}

/**
 * Teacher edits marks for a specific class under a subject.
 */
async function editSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.body.classId;

  const normClasses = normalizeClasses(session);
  const targetClass = classId
    ? normClasses.find((c) => c._id.toString() === classId.toString() || c.name === classId)
    : normClasses[0];

  if (!targetClass) throw new AppError('Class not found in this exam session', 404);

  const totalMarks = req.body.totalMarks ?? link.totalMarks;
  const passingMarks = req.body.passingMarks ?? link.passingMarks;
  if (passingMarks > totalMarks) throw new AppError('Passing marks cannot exceed total marks', 400);

  const classStudents = session.students.filter(
    (s) =>
      (s.classId && s.classId.toString() === targetClass._id.toString()) ||
      (s.class && s.class === targetClass.name)
  );
  const relevantStudents = classStudents.length > 0 ? classStudents : session.students;
  validateSubmissionMarks(relevantStudents, req.body.marks, totalMarks);

  let classSub = link.classSubmissions?.find(
    (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
  );
  if (!classSub) {
    classSub = {
      classId: targetClass._id,
      className: targetClass.name,
      section: targetClass.section || '',
      status: 'SUBMITTED',
      marks: req.body.marks,
      submittedVia: 'teacher',
      submittedAt: new Date(),
    };
    link.classSubmissions.push(classSub);
  } else {
    if (classSub.status === 'LOCKED') throw new AppError('Unlock this class before editing its marks', 400);
    classSub.marks = req.body.marks;
    classSub.status = 'SUBMITTED';
    classSub.submittedVia = 'teacher';
    classSub.submittedAt = new Date();
  }

  link.totalMarks = totalMarks;
  link.passingMarks = passingMarks;
  // Also keep top level marks for legacy
  link.marks = req.body.marks;
  link.submittedVia = 'teacher';
  link.submittedAt = new Date();
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_MARKS_EDITED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      subjectId: subject._id,
      subjectName: subject.name,
      classId: targetClass._id,
      className: targetClass.name,
      studentCount: req.body.marks.length,
    },
  });

  return ok(res, { submission: link }, 'Marks updated');
}

/**
 * Reopens a specific class submission for a subject.
 * Clears only that class's marks and sets its status back to PENDING.
 * The same link can then be used to submit again for that class.
 */
async function reopenSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.query.classId || req.body?.classId;

  const normClasses = normalizeClasses(session);
  const targetClass = classId
    ? normClasses.find((c) => c._id.toString() === classId.toString() || c.name === classId)
    : normClasses[0];

  if (!targetClass) throw new AppError('Class not found in this exam session', 404);

  const classSub = link.classSubmissions?.find(
    (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
  );

  if (!classSub || classSub.status === 'PENDING') {
    throw new AppError(`${targetClass.name} has not been submitted yet`, 400);
  }
  if (classSub.status === 'LOCKED') {
    throw new AppError('Unlock this class before reopening it', 400);
  }

  const clearedMarks = [...classSub.marks];
  const clearedAt = classSub.submittedAt;

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_CLASS_REOPENED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      subjectId: subject._id,
      subjectName: subject.name,
      classId: targetClass._id,
      className: targetClass.name,
      clearedMarksCount: clearedMarks.length,
      clearedAt,
    },
  });

  classSub.marks = [];
  classSub.status = 'PENDING';
  classSub.submittedAt = null;
  classSub.submittedVia = null;

  // Update overall link status
  const submittedClasses = link.classSubmissions.filter(
    (cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED'
  );
  link.status = submittedClasses.length > 0 ? 'IN_PROGRESS' : 'PENDING';
  await link.save();

  return ok(res, { link }, `${targetClass.name} ${subject.name} reopened. The same link can be used to submit it again.`);
}

async function setSubjectLock(req, res, locked) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.query.classId;

  if (classId) {
    const classSub = link.classSubmissions?.find(
      (cs) => cs.classId?.toString() === classId.toString() || cs.className === classId
    );
    if (!classSub) throw new AppError('Class not found in submission', 404);
    if (locked && classSub.status !== 'SUBMITTED') throw new AppError('Only a submitted class can be locked', 400);
    if (!locked && classSub.status !== 'LOCKED') throw new AppError('This class is not locked', 400);
    classSub.status = locked ? 'LOCKED' : 'SUBMITTED';
  } else {
    link.status = locked ? 'LOCKED' : 'SUBMITTED';
  }
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: locked ? 'SUBJECT_LOCKED' : 'SUBJECT_UNLOCKED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, classId },
  });

  return ok(res, { link }, locked ? `${subject.name} locked` : `${subject.name} unlocked`);
}

const lockSubject = (req, res) => setSubjectLock(req, res, true);
const unlockSubject = (req, res) => setSubjectLock(req, res, false);

/**
 * Generates final result independently for one class.
 * Enforces that all required subjects for this class are SUBMITTED or LOCKED.
 */
async function generateClassFinalResult(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const classId = req.params.classId || req.body.classId;

  const targetClass = normClasses.find(
    (c) => c._id.toString() === classId.toString() || c.name === classId
  );
  if (!targetClass) {
    throw new AppError('Class not found in this exam session', 404);
  }

  if (targetClass.finalResultId) {
    throw new AppError(`The result for ${targetClass.name} has already been finalized`, 400);
  }

  // Check every subject in the session has a completed submission for this class
  const links = await SubjectSubmission.find({ resultSession: session._id }).lean();
  const pendingSubjects = [];

  links.forEach((link) => {
    let classSub = link.classSubmissions?.find(
      (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
    );
    const isDone = classSub ? classSub.status === 'SUBMITTED' || classSub.status === 'LOCKED' : link.status === 'SUBMITTED' || link.status === 'LOCKED';
    if (!isDone) {
      pendingSubjects.push(link.subjectName);
    }
  });

  if (pendingSubjects.length > 0) {
    throw new AppError(
      `Cannot finalize ${targetClass.name}. ${pendingSubjects.length} subject(s) still pending: ${pendingSubjects.join(', ')}`,
      400
    );
  }

  const subjects = session.subjects.map((s) => {
    const link = links.find((l) => l.subjectId.toString() === s._id.toString());
    return {
      name: s.name,
      totalMarks: link ? link.totalMarks : s.totalMarks,
      passingMarks: link ? link.passingMarks : s.passingMarks,
    };
  });

  const marksByRollAndSubject = new Map();
  links.forEach((link) => {
    let classSub = link.classSubmissions?.find(
      (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
    );
    const marksList = classSub?.marks || link.marks || [];
    marksList.forEach((m) => {
      marksByRollAndSubject.set(`${m.rollNumber}|${link.subjectName}`, m.obtained);
    });
  });

  const classStudents = session.students.filter(
    (s) =>
      (s.classId && s.classId.toString() === targetClass._id.toString()) ||
      (s.class && s.class === targetClass.name)
  );
  const studentsToCalculate = classStudents.length > 0 ? classStudents : session.students;

  const students = studentsToCalculate.map((s) => ({
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
    expectedStrength: studentsToCalculate.length,
  });

  const result = await Result.create({
    createdBy: req.user._id,
    teacherNameSnapshot: session.teacherNameSnapshot,
    sourceSessionId: session._id,
    sourceSessionClassId: targetClass._id,
    schoolInfo: session.schoolInfo,
    class: targetClass.name,
    section: targetClass.section || '',
    academicYear: session.academicYear,
    examType: session.examType,
    examName: session.examName,
    resultDate: session.resultDate,
    subjects,
    students: calculatedStudents,
    statistics,
  });

  // Update session class finalResultId
  const sessionClassEntry = session.classes?.find((c) => c._id.toString() === targetClass._id.toString());
  if (sessionClassEntry) {
    sessionClassEntry.finalResultId = result._id;
  }
  session.finalResultId = result._id; // Most recent finalized result

  // Check if all classes are now finalized
  const allFinalized = normClasses.every((c) => {
    if (c._id.toString() === targetClass._id.toString()) return true;
    return !!c.finalResultId;
  });
  if (allFinalized) {
    session.submissionStatus = 'OFF';
  }
  await session.save();

  await logActivity({
    userId: req.user._id,
    action: 'FINAL_RESULT_GENERATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      resultId: result._id,
      class: targetClass.name,
      studentCount: statistics.totalStudents,
    },
  });

  return ok(res, { result }, `Final result for ${targetClass.name} generated successfully`, 201);
}

/**
 * Legacy or single-class helper for generateFinalResult
 */
async function generateFinalResult(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const classId = req.params.classId || req.query.classId || req.body?.classId || normClasses[0]?._id;
  req.params.classId = classId.toString();
  return generateClassFinalResult(req, res);
}

/**
 * Permanently deletes ONE class's result data from an exam session.
 * Removes class marks, subject class submissions, class from session, and finalized Result doc.
 * Master Student records are NEVER touched!
 */
async function deleteClassResultPermanently(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const targetClass = normClasses.find(
    (c) => c._id.toString() === req.params.classId || c.name === req.params.classId
  );
  if (!targetClass) {
    throw new AppError('Class not found in this exam session', 404);
  }

  const affectedStudents = session.students.filter(
    (s) =>
      (s.classId && s.classId.toString() === targetClass._id.toString()) ||
      (s.class && s.class === targetClass.name)
  );

  // 1. Audit log BEFORE deletion
  await logActivity({
    userId: req.user._id,
    action: 'PERMANENT_RESULT_DELETION',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      examName: session.examName || session.examType,
      class: targetClass.name,
      section: targetClass.section || '',
      studentCount: affectedStudents.length,
      affectedSubjectCount: session.subjects.length,
      scope: 'CLASS_RESULT',
    },
  });

  // 2. Delete finalized Result doc for this class if exists
  if (targetClass.finalResultId) {
    await Result.findByIdAndDelete(targetClass.finalResultId);
  }
  await Result.deleteMany({
    sourceSessionId: session._id,
    $or: [{ sourceSessionClassId: targetClass._id }, { class: targetClass.name }],
  });

  // 3. Remove classSubmissions entries for this class across all SubjectSubmissions
  await SubjectSubmission.updateMany(
    { resultSession: session._id },
    {
      $pull: {
        classSubmissions: {
          $or: [{ classId: targetClass._id }, { className: targetClass.name }],
        },
      },
    }
  );

  // 4. Remove students of this class from session
  session.students = session.students.filter(
    (s) =>
      !(
        (s.classId && s.classId.toString() === targetClass._id.toString()) ||
        (s.class && s.class === targetClass.name)
      )
  );

  // 5. Remove class from session.classes
  if (session.classes && session.classes.length > 0) {
    session.classes = session.classes.filter(
      (c) => c._id.toString() !== targetClass._id.toString() && c.name !== targetClass.name
    );
  }

  // If no classes remain, delete the entire session and submissions
  if (!session.classes || session.classes.length === 0) {
    await SubjectSubmission.deleteMany({ resultSession: session._id });
    await session.deleteOne();
    return ok(res, null, `${targetClass.name} result and empty session permanently deleted.`);
  }

  // Update summary class name
  session.class = session.classes.map((c) => c.name).join(', ');
  await session.save();

  return ok(res, null, `${targetClass.name} result permanently deleted.`);
}

/**
 * Permanently deletes the ENTIRE exam session with all classes, marks, and final results.
 * Master Student records are NEVER touched!
 */
async function deleteEntireExamPermanently(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);

  // 1. Audit log BEFORE deletion
  await logActivity({
    userId: req.user._id,
    action: 'PERMANENT_RESULT_DELETION',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      examName: session.examName || session.examType,
      classes: normClasses.map((c) => c.name),
      studentCount: session.students.length,
      affectedSubjectCount: session.subjects.length,
      scope: 'ENTIRE_EXAM',
    },
  });

  // 2. Delete all finalized results linked to this session
  await Result.deleteMany({
    $or: [{ sourceSessionId: session._id }, { _id: session.finalResultId }],
  });

  // 3. Delete all SubjectSubmission records for this session
  await SubjectSubmission.deleteMany({ resultSession: session._id });

  // 4. Delete the ResultSession document
  await session.deleteOne();

  return ok(res, null, 'Entire exam and all associated results permanently deleted.');
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
  generateClassFinalResult,
  generateFinalResult,
  deleteClassResultPermanently,
  deleteEntireExamPermanently,
};
