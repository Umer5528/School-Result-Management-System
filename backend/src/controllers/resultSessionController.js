const mongoose = require('mongoose');
const { ResultSession, Student, SubjectSubmission, Result } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubjects, validateSubmissionMarks, calculateResult } = require('../services/resultCalculationService');
const { generateSubmissionToken, hashToken } = require('../utils/submissionToken');
const { logActivity } = require('../services/activityLogService');
const {
  attachSubmissionStatus,
  attachSubmissionCounts,
  buildSubmissionView,
  normalizeClasses,
  formatDisplayName,
} = require('../services/resultSessionViewService');
const { rememberClassProfile } = require('./classProfileController');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

// Owner filter: allows owner or admins with manage permissions
function sessionAccessFilter(req, extra = {}) {
  const user = req.user;
  if (user.role === 'super_admin' || (user.role === 'assistant_admin' && (user.permissions || []).includes('VIEW_RESULTS'))) {
    return extra;
  }
  return { createdBy: user._id, ...extra };
}

async function getSessionOrThrow(req) {
  const session = await ResultSession.findById(req.params.id);
  if (!session) throw new AppError('Result session not found', 404);

  const user = req.user;
  const isOwner = session.createdBy.toString() === user._id.toString();
  const isAdminView =
    user.role === 'super_admin' ||
    (user.role === 'assistant_admin' && (user.permissions || []).includes('VIEW_RESULTS'));
  const isAdminManage =
    user.role === 'super_admin' ||
    (user.role === 'assistant_admin' && (user.permissions || []).includes('MANAGE_RESULTS'));

  if (req.method === 'GET') {
    if (!isOwner && !isAdminView && !isAdminManage) {
      throw new AppError('You do not have access to this result session', 403);
    }
  } else {
    if (!isOwner && !isAdminManage) {
      throw new AppError('You do not have permission to modify this result session', 403);
    }
  }

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
 * Creates one exam session for one or multiple classes/groups.
 * Each class/group combination can have its own independent subjects configured.
 */
async function createSession(req, res) {
  const { studentIds, subjects: topLevelSubjects, classes: inputClasses, ...meta } = req.body;

  const students = await Student.find({ _id: { $in: studentIds }, createdBy: req.user._id, active: true });
  if (students.length !== studentIds.length) {
    throw new AppError('One or more selected students were not found in your roster', 400);
  }

  // Normalize classes and their subjects
  let rawClasses = [];
  if (Array.isArray(inputClasses) && inputClasses.length > 0) {
    rawClasses = inputClasses.map((c) => {
      if (typeof c === 'string') {
        return { name: c.trim(), group: '', section: '', subjects: [] };
      }
      return {
        name: (c.name || '').trim(),
        group: (c.group || '').trim(),
        section: (c.section || '').trim(),
        displayName: c.displayName ? c.displayName.trim() : undefined,
        subjects: Array.isArray(c.subjects) ? c.subjects : [],
      };
    });
  } else if (meta.class) {
    rawClasses = [
      {
        name: meta.class.trim(),
        group: (meta.group || '').trim(),
        section: (meta.section || '').trim(),
        subjects: topLevelSubjects || [],
      },
    ];
  } else {
    // Group students by class and group
    const seenCombos = new Map();
    students.forEach((s) => {
      const key = `${s.class}|${s.group || ''}|${s.section || ''}`;
      if (!seenCombos.has(key)) {
        seenCombos.set(key, { name: s.class, group: s.group || '', section: s.section || '', subjects: [] });
      }
    });
    rawClasses = Array.from(seenCombos.values());
  }

  // Build classDocs with validated per-class subjects
  const classDocs = rawClasses.map((c) => {
    const classId = new mongoose.Types.ObjectId();
    const candidateSubjects =
      Array.isArray(c.subjects) && c.subjects.length > 0 ? c.subjects : topLevelSubjects || [];

    if (candidateSubjects.length > 0) {
      validateSubjects(candidateSubjects);
    }

    const classSubjs = candidateSubjects.map((s) => ({
      _id: new mongoose.Types.ObjectId(),
      name: s.name.trim(),
      totalMarks: Number(s.totalMarks),
      passingMarks: Number(s.passingMarks),
      allowSubmitterConfig: !!s.allowSubmitterConfig,
    }));

    return {
      _id: classId,
      name: c.name,
      group: c.group || '',
      section: c.section || '',
      displayName: formatDisplayName(c),
      subjects: classSubjs,
      finalResultId: null,
    };
  });

  // Verify that every class has at least one subject configured
  for (const c of classDocs) {
    if (!c.subjects || c.subjects.length === 0) {
      throw new AppError(`Class/group ${c.displayName || c.name} must have at least one subject configured`, 400);
    }
  }

  // Match students to the correct class/group combination
  const sessionStudents = students.map((s) => {
    const matchedClass =
      classDocs.find((c) => {
        if (c.name !== s.class) return false;
        if (c.group && s.group && c.group !== s.group) return false;
        if (c.section && s.section && c.section !== s.section) return false;
        return true;
      }) ||
      classDocs.find((c) => c.name === s.class) ||
      classDocs[0];

    return {
      rollNumber: s.rollNumber,
      name: s.name,
      fatherName: s.fatherName,
      class: s.class,
      group: s.group || matchedClass?.group || '',
      section: s.section || matchedClass?.section || '',
      classId: matchedClass?._id,
      studentId: s._id,
    };
  });

  // Aggregated unique subjects list across all classes
  const uniqueSubjsMap = new Map();
  classDocs.forEach((c) => {
    c.subjects.forEach((s) => {
      const key = s.name.trim().toLowerCase();
      if (!uniqueSubjsMap.has(key)) {
        uniqueSubjsMap.set(key, s);
      }
    });
  });
  const aggregatedSubjects = Array.from(uniqueSubjsMap.values());

  const session = await ResultSession.create({
    ...meta,
    createdBy: req.user._id,
    teacherNameSnapshot: req.user.name,
    class: classDocs.map((c) => c.displayName || c.name).join(', '),
    group: classDocs.length === 1 ? classDocs[0].group : '',
    section: classDocs.length === 1 ? classDocs[0].section : '',
    classes: classDocs,
    students: sessionStudents,
    subjects: aggregatedSubjects,
    submissionStatus: 'OFF',
  });

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_SESSION_CREATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      classes: classDocs.map((c) => c.displayName || c.name),
      examType: session.examType,
      students: students.length,
      subjects: aggregatedSubjects.length,
    },
  });

  // Remember class profile
  classDocs.forEach((c) => {
    const classStudentSubset = students.filter(
      (s) => s.class === c.name && (!c.group || s.group === c.group)
    );
    rememberClassProfile({
      teacherId: req.user._id,
      class: c.name,
      group: c.group,
      section: c.section,
      schoolInfo: session.schoolInfo,
      subjects: c.subjects,
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
 * Activates submission: provisions ONE SubjectSubmission per unique subject across the exam.
 * Each SubjectSubmission covers ONLY the class/group combinations where that subject is configured.
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
  const bySubjectName = new Map(existing.map((s) => [s.subjectName.trim().toLowerCase(), s]));

  // Find all unique subjects and which classes configured them
  const uniqueSubjectsMap = new Map();
  normClasses.forEach((c) => {
    (c.subjects || []).forEach((s) => {
      const key = s.name.trim().toLowerCase();
      if (!uniqueSubjectsMap.has(key)) {
        uniqueSubjectsMap.set(key, {
          name: s.name.trim(),
          classes: [],
        });
      }
      uniqueSubjectsMap.get(key).classes.push({
        class: c,
        config: s,
      });
    });
  });

  // Legacy fallback if no per-class subjects
  if (uniqueSubjectsMap.size === 0 && Array.isArray(session.subjects)) {
    session.subjects.forEach((s) => {
      const key = s.name.trim().toLowerCase();
      uniqueSubjectsMap.set(key, {
        name: s.name.trim(),
        classes: normClasses.map((c) => ({ class: c, config: s })),
      });
    });
  }

  const created = [];
  for (const [key, { name: subjectName, classes: authorizedClassConfigs }] of uniqueSubjectsMap) {
    const existingDoc = bySubjectName.get(key);
    if (existingDoc) {
      // Re-activating: ensure authorized classes exist in classSubmissions
      authorizedClassConfigs.forEach(({ class: c, config }) => {
        let found = existingDoc.classSubmissions?.find(
          (cs) =>
            (cs.classId && cs.classId.toString() === c._id.toString()) ||
            (cs.className === c.name && (cs.group || '') === (c.group || ''))
        );
        if (!found) {
          existingDoc.classSubmissions.push({
            classId: c._id,
            className: c.name,
            group: c.group || '',
            section: c.section || '',
            displayName: c.displayName,
            subjectConfigId: config._id,
            totalMarks: config.totalMarks,
            passingMarks: config.passingMarks,
            status: 'PENDING',
            marks: [],
          });
        } else {
          found.subjectConfigId = config._id;
          found.totalMarks = config.totalMarks;
          found.passingMarks = config.passingMarks;
          if (found.status === 'DISABLED') found.status = 'PENDING';
        }
      });

      // Filter out classes not configured for this subject
      existingDoc.classSubmissions = existingDoc.classSubmissions.filter((cs) =>
        authorizedClassConfigs.some(
          ({ class: c }) =>
            (cs.classId && cs.classId.toString() === c._id.toString()) ||
            (cs.className === c.name && (cs.group || '') === (c.group || ''))
        )
      );

      if (existingDoc.status === 'DISABLED') existingDoc.status = 'PENDING';
      // eslint-disable-next-line no-await-in-loop
      await existingDoc.save();
    } else {
      // Provision ONE unique link for this subject covering only authorized classes
      // eslint-disable-next-line no-await-in-loop
      const token = await generateUniqueSubjectToken();
      const primaryConfig = authorizedClassConfigs[0]?.config;
      const classSubmissions = authorizedClassConfigs.map(({ class: c, config }) => ({
        classId: c._id,
        className: c.name,
        group: c.group || '',
        section: c.section || '',
        displayName: c.displayName,
        subjectConfigId: config._id,
        totalMarks: config.totalMarks,
        passingMarks: config.passingMarks,
        status: 'PENDING',
        marks: [],
      }));

      // eslint-disable-next-line no-await-in-loop
      const doc = await SubjectSubmission.create({
        resultSession: session._id,
        subjectId: primaryConfig?._id || new mongoose.Types.ObjectId(),
        subjectName,
        totalMarks: primaryConfig?.totalMarks || 100,
        passingMarks: primaryConfig?.passingMarks || 40,
        allowSubmitterConfig: !!primaryConfig?.allowSubmitterConfig,
        submissionToken: token,
        tokenHash: hashToken(token),
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
  const subjectIdParam = req.params.subjectId;

  // Search by subjectId or doc _id or in class subjects
  let link = await SubjectSubmission.findOne({
    resultSession: session._id,
    $or: [{ subjectId: subjectIdParam }, { _id: mongoose.isValidObjectId(subjectIdParam) ? subjectIdParam : null }],
  });

  let subjectName = link?.subjectName;
  if (!link) {
    // Search by subject in session classes
    for (const c of session.classes || []) {
      const match = (c.subjects || []).find(
        (s) => s._id?.toString() === subjectIdParam || s.name === subjectIdParam
      );
      if (match) {
        subjectName = match.name;
        link = await SubjectSubmission.findOne({
          resultSession: session._id,
          subjectName: new RegExp(`^${match.name.trim()}$`, 'i'),
        });
        break;
      }
    }
  }

  if (!link) {
    throw new AppError("This subject's submission link has not been generated yet. Activate result submission first.", 404);
  }

  const subject = {
    _id: link.subjectId,
    name: link.subjectName,
    totalMarks: link.totalMarks,
    passingMarks: link.passingMarks,
  };

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
    submittedClasses.length >= (link.classSubmissions?.length || 1)
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
  link.submissionToken = await generateUniqueSubjectToken();
  link.tokenHash = hashToken(link.submissionToken);
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_LINK_TOKEN_REGENERATED',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, regenerated: true },
  });

  return ok(res, { link }, `New link generated for ${subject.name}. The previous link no longer works.`);
}

async function getSubjectSubmission(req, res) {
  const { session, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.query.classId || null;
  return ok(res, { submission: buildSubmissionView(session, link, classId) });
}

async function editSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.body.classId;

  const normClasses = normalizeClasses(session);
  const targetClass = classId
    ? normClasses.find(
        (c) =>
          c._id.toString() === classId.toString() ||
          c.name === classId ||
          c.displayName === classId
      )
    : normClasses[0];

  if (!targetClass) throw new AppError('Class not found in this exam session', 404);

  let classSub = link.classSubmissions?.find(
    (cs) =>
      (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
      (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
  );

  const totalMarks = req.body.totalMarks ?? classSub?.totalMarks ?? link.totalMarks;
  const passingMarks = req.body.passingMarks ?? classSub?.passingMarks ?? link.passingMarks;
  if (passingMarks > totalMarks) throw new AppError('Passing marks cannot exceed total marks', 400);

  const classStudents = session.students.filter((s) => {
    if (s.classId && s.classId.toString() === targetClass._id.toString()) return true;
    if (s.class === targetClass.name) {
      if (!targetClass.group) return true;
      return s.group === targetClass.group;
    }
    return false;
  });
  const relevantStudents = classStudents.length > 0 ? classStudents : session.students;
  validateSubmissionMarks(relevantStudents, req.body.marks, totalMarks);

  if (!classSub) {
    classSub = {
      classId: targetClass._id,
      className: targetClass.name,
      group: targetClass.group || '',
      section: targetClass.section || '',
      displayName: targetClass.displayName,
      totalMarks,
      passingMarks,
      status: 'SUBMITTED',
      marks: req.body.marks,
      submittedVia: 'teacher',
      submittedAt: new Date(),
    };
    link.classSubmissions.push(classSub);
  } else {
    if (classSub.status === 'LOCKED') throw new AppError('Unlock this class before editing its marks', 400);
    classSub.marks = req.body.marks;
    classSub.totalMarks = totalMarks;
    classSub.passingMarks = passingMarks;
    classSub.status = 'SUBMITTED';
    classSub.submittedVia = 'teacher';
    classSub.submittedAt = new Date();
  }

  link.totalMarks = totalMarks;
  link.passingMarks = passingMarks;
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
      group: targetClass.group || '',
      studentCount: req.body.marks.length,
    },
  });

  return ok(res, { submission: link }, 'Marks updated');
}

async function reopenSubjectSubmission(req, res) {
  const { session, subject, link } = await findSubjectLink(req);
  const classId = req.params.classId || req.query.classId || req.body?.classId;

  const normClasses = normalizeClasses(session);
  const targetClass = classId
    ? normClasses.find(
        (c) =>
          c._id.toString() === classId.toString() ||
          c.name === classId ||
          c.displayName === classId
      )
    : normClasses[0];

  if (!targetClass) throw new AppError('Class not found in this exam session', 404);

  const classSub = link.classSubmissions?.find(
    (cs) =>
      (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
      (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
  );

  if (!classSub || classSub.status === 'PENDING') {
    throw new AppError(`${targetClass.displayName || targetClass.name} has not been submitted yet`, 400);
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
      group: targetClass.group || '',
      clearedMarksCount: clearedMarks.length,
      clearedAt,
    },
  });

  classSub.marks = [];
  classSub.status = 'PENDING';
  classSub.submittedAt = null;
  classSub.submittedVia = null;

  const submittedClasses = link.classSubmissions.filter(
    (cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED'
  );
  link.status = submittedClasses.length > 0 ? 'IN_PROGRESS' : 'PENDING';
  await link.save();

  return ok(
    res,
    { link },
    `${targetClass.displayName || targetClass.name} ${subject.name} reopened. The same link can be used to submit it again.`
  );
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
 * Generates final result independently for one class/group configuration.
 * Enforces that all required subjects for this specific class/group are SUBMITTED or LOCKED.
 * Calculates rankings, total max marks, and pass/fail strictly within this class/group.
 */
async function generateClassFinalResult(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const classId = req.params.classId || req.body.classId;

  const targetClass = normClasses.find(
    (c) =>
      c._id.toString() === classId.toString() ||
      c.name === classId ||
      c.displayName === classId
  );
  if (!targetClass) {
    throw new AppError('Class not found in this exam session', 404);
  }

  if (targetClass.finalResultId) {
    throw new AppError(`The result for ${targetClass.displayName || targetClass.name} has already been finalized`, 400);
  }

  // Get subjects configured specifically for this class/group
  const classRequiredSubjects =
    targetClass.subjects && targetClass.subjects.length > 0 ? targetClass.subjects : session.subjects;

  const links = await SubjectSubmission.find({ resultSession: session._id }).lean();
  const pendingSubjects = [];

  classRequiredSubjects.forEach((s) => {
    const link = links.find(
      (l) =>
        l.subjectName.trim().toLowerCase() === s.name.trim().toLowerCase() ||
        l.subjectId.toString() === s._id?.toString()
    );
    if (!link) {
      pendingSubjects.push(s.name);
      return;
    }
    const classSub = link.classSubmissions?.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
        (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
    );
    const isDone = classSub
      ? classSub.status === 'SUBMITTED' || classSub.status === 'LOCKED'
      : link.status === 'SUBMITTED' || link.status === 'LOCKED';
    if (!isDone) {
      pendingSubjects.push(s.name);
    }
  });

  if (pendingSubjects.length > 0) {
    throw new AppError(
      `Cannot finalize ${targetClass.displayName || targetClass.name}. ${pendingSubjects.length} subject(s) still pending: ${pendingSubjects.join(', ')}`,
      400
    );
  }

  // Build marks map strictly from submissions of this class
  const marksByRollAndSubject = new Map();
  links.forEach((link) => {
    const classSub = link.classSubmissions?.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
        (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
    );
    const marksList = classSub?.marks || link.marks || [];
    marksList.forEach((m) => {
      marksByRollAndSubject.set(`${m.rollNumber}|${link.subjectName.trim().toLowerCase()}`, m.obtained);
    });
  });

  // Filter students strictly belonging to this class/group
  const classStudents = session.students.filter((s) => {
    if (s.classId && s.classId.toString() === targetClass._id.toString()) return true;
    if (s.class === targetClass.name) {
      if (!targetClass.group) return true;
      return s.group === targetClass.group;
    }
    return false;
  });
  const studentsToCalculate = classStudents.length > 0 ? classStudents : session.students;

  const subjectsForCalc = classRequiredSubjects.map((s) => {
    const link = links.find(
      (l) =>
        l.subjectName.trim().toLowerCase() === s.name.trim().toLowerCase() ||
        l.subjectId.toString() === s._id?.toString()
    );
    const classSub = link?.classSubmissions?.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
        (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
    );
    return {
      name: s.name,
      totalMarks: classSub?.totalMarks ?? link?.totalMarks ?? s.totalMarks,
      passingMarks: classSub?.passingMarks ?? link?.passingMarks ?? s.passingMarks,
    };
  });

  const students = studentsToCalculate.map((s) => ({
    rollNumber: s.rollNumber,
    name: s.name,
    fatherName: s.fatherName,
    marks: subjectsForCalc.map((subj) => ({
      subject: subj.name,
      obtained: marksByRollAndSubject.get(`${s.rollNumber}|${subj.name.trim().toLowerCase()}`) ?? 0,
    })),
  }));

  const { students: calculatedStudents, statistics } = calculateResult({
    subjects: subjectsForCalc,
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
    group: targetClass.group || '',
    section: targetClass.section || '',
    academicYear: session.academicYear,
    examType: session.examType,
    examName: session.examName,
    resultDate: session.resultDate,
    subjects: subjectsForCalc,
    students: calculatedStudents,
    statistics,
  });

  // Update session class finalResultId
  const sessionClassEntry = session.classes?.find((c) => c._id.toString() === targetClass._id.toString());
  if (sessionClassEntry) {
    sessionClassEntry.finalResultId = result._id;
  }
  session.finalResultId = result._id;

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
      group: targetClass.group || '',
      studentCount: statistics.totalStudents,
    },
  });

  return ok(res, { result }, `Final result for ${targetClass.displayName || targetClass.name} generated successfully`, 201);
}

async function generateFinalResult(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const classId = req.params.classId || req.query.classId || req.body?.classId || normClasses[0]?._id;
  req.params.classId = classId.toString();
  return generateClassFinalResult(req, res);
}

/**
 * Permanently deletes ONE class/group result data from an exam session.
 * Removes its subject submissions, marks, and finalized result doc.
 * Master Student records and other groups in the exam are NEVER touched!
 */
async function deleteClassResultPermanently(req, res) {
  const session = await getSessionOrThrow(req);
  const normClasses = normalizeClasses(session);
  const targetClass = normClasses.find(
    (c) =>
      c._id.toString() === req.params.classId ||
      c.name === req.params.classId ||
      c.displayName === req.params.classId
  );
  if (!targetClass) {
    throw new AppError('Class not found in this exam session', 404);
  }

  const affectedStudents = session.students.filter((s) => {
    if (s.classId && s.classId.toString() === targetClass._id.toString()) return true;
    if (s.class === targetClass.name) {
      if (!targetClass.group) return true;
      return s.group === targetClass.group;
    }
    return false;
  });

  // 1. Audit log BEFORE deletion
  await logActivity({
    userId: req.user._id,
    action: 'PERMANENT_RESULT_DELETION',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      examName: session.examName || session.examType,
      class: targetClass.name,
      group: targetClass.group || '',
      section: targetClass.section || '',
      studentCount: affectedStudents.length,
      affectedSubjectCount: (targetClass.subjects || session.subjects || []).length,
      scope: 'CLASS_GROUP_RESULT',
    },
  });

  // 2. Delete finalized Result doc for this class if exists
  if (targetClass.finalResultId) {
    await Result.findByIdAndDelete(targetClass.finalResultId);
  }
  await Result.deleteMany({
    sourceSessionId: session._id,
    $or: [
      { sourceSessionClassId: targetClass._id },
      { class: targetClass.name, group: targetClass.group || '' },
    ],
  });

  // 3. Remove classSubmissions entries for this class across all SubjectSubmissions
  await SubjectSubmission.updateMany(
    { resultSession: session._id },
    {
      $pull: {
        classSubmissions: {
          $or: [
            { classId: targetClass._id },
            { className: targetClass.name, group: targetClass.group || '' },
          ],
        },
      },
    }
  );

  // If any SubjectSubmission now has 0 classSubmissions, delete it (no classes remaining with this subject)
  await SubjectSubmission.deleteMany({
    resultSession: session._id,
    classSubmissions: { $size: 0 },
  });

  // 4. Remove students of this class/group from session
  session.students = session.students.filter((s) => {
    if (s.classId && s.classId.toString() === targetClass._id.toString()) return false;
    if (s.class === targetClass.name && (!targetClass.group || s.group === targetClass.group)) return false;
    return true;
  });

  // 5. Remove class from session.classes
  if (session.classes && session.classes.length > 0) {
    session.classes = session.classes.filter(
      (c) => c._id.toString() !== targetClass._id.toString()
    );
  }

  // If no classes remain, delete the entire session and submissions
  if (!session.classes || session.classes.length === 0) {
    await SubjectSubmission.deleteMany({ resultSession: session._id });
    await session.deleteOne();
    return ok(res, null, `${targetClass.displayName || targetClass.name} result and empty session permanently deleted.`);
  }

  // Update summary class name
  session.class = session.classes.map((c) => c.displayName || c.name).join(', ');
  await session.save();

  return ok(res, null, `${targetClass.displayName || targetClass.name} result permanently deleted.`);
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
      classes: normClasses.map((c) => c.displayName || c.name),
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
