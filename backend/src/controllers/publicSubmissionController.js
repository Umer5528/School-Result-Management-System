const { SubjectSubmission, ResultSession } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubmissionMarks } = require('../services/resultCalculationService');
const { logActivity } = require('../services/activityLogService');
const { normalizeClasses, formatDisplayName } = require('../services/resultSessionViewService');
const { hashToken } = require('../utils/submissionToken');

/**
 * Finds and validates the SubjectSubmission and associated ResultSession by token.
 * Validates that the link exists, is not disabled, and the session is valid.
 */
async function findLinkByToken(token) {
  if (!token || typeof token !== 'string') {
    throw new AppError('Invalid submission link', 404);
  }
  const normalized = token.trim().toUpperCase();
  const hashed = hashToken(normalized);
  const link = await SubjectSubmission.findOne({
    $or: [{ tokenHash: hashed }, { submissionToken: normalized }],
  });
  if (!link) {
    throw new AppError('Invalid submission link', 404);
  }
  if (link.status === 'DISABLED') {
    throw new AppError('This submission link is currently disabled. Please contact the administrator.', 403);
  }

  const session = await ResultSession.findById(link.resultSession);
  if (!session) {
    throw new AppError('Invalid submission link', 404);
  }

  return { link, session };
}

/**
 * GET /api/public/submissions/:token
 * Returns exam details, subject details, and ONLY the authorized classes/groups configured for this subject.
 * Submitter never sees unauthorized classes or other subjects/exams.
 */
async function getSubmissionInfo(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const normClasses = normalizeClasses(session);

  let authorizedClassSubs = [];
  if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
    authorizedClassSubs = link.classSubmissions;
  } else {
    // Legacy fallback for single class
    const firstClass = normClasses[0];
    authorizedClassSubs = [
      {
        classId: firstClass._id,
        className: firstClass.name,
        group: firstClass.group || '',
        section: firstClass.section || '',
        displayName: firstClass.displayName || firstClass.name,
        totalMarks: link.totalMarks,
        passingMarks: link.passingMarks,
        status: link.status === 'SUBMITTED' || link.status === 'LOCKED' ? link.status : 'PENDING',
        marks: link.marks || [],
        submittedAt: link.submittedAt,
      },
    ];
  }

  const classesSummary = authorizedClassSubs.map((cs) => {
    const studentCount = session.students.filter((s) => {
      if (s.classId && cs.classId && s.classId.toString() === cs.classId.toString()) return true;
      if (s.class === cs.className) {
        if (!cs.group) return true;
        return s.group === cs.group;
      }
      return false;
    }).length;

    return {
      _id: cs.classId,
      name: cs.className,
      group: cs.group || '',
      section: cs.section || '',
      displayName: cs.displayName || formatDisplayName(cs),
      totalMarks: cs.totalMarks ?? link.totalMarks,
      passingMarks: cs.passingMarks ?? link.passingMarks,
      status: cs.status,
      submittedAt: cs.submittedAt || null,
      studentCount: studentCount > 0 ? studentCount : session.students.length,
    };
  });

  const submittedClassesCount = classesSummary.filter(
    (c) => c.status === 'SUBMITTED' || c.status === 'LOCKED'
  ).length;
  const isComplete = submittedClassesCount === classesSummary.length && classesSummary.length > 0;
  const overallStatus =
    link.status === 'DISABLED'
      ? 'DISABLED'
      : isComplete
      ? 'SUBMITTED'
      : submittedClassesCount > 0
      ? 'IN_PROGRESS'
      : 'PENDING';

  return ok(res, {
    session: {
      examName: session.examName,
      examType: session.examType,
      resultDate: session.resultDate,
      academicYear: session.academicYear,
      schoolInfo: session.schoolInfo,
    },
    subject: {
      name: link.subjectName,
      totalMarks: link.totalMarks,
      passingMarks: link.passingMarks,
      allowSubmitterConfig: link.allowSubmitterConfig,
      overallStatus,
    },
    classes: classesSummary,
  });
}

/**
 * GET /api/public/submissions/:token/classes/:classId
 * Returns the student roster ONLY for the authorized class specified.
 * Validates that classId belongs strictly to this subject link.
 */
async function getClassRoster(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const normClasses = normalizeClasses(session);

  let classSub = null;
  if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
    classSub = link.classSubmissions.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === req.params.classId) ||
        cs.className === req.params.classId ||
        cs.displayName === req.params.classId
    );
  } else {
    const firstClass = normClasses[0];
    if (firstClass._id.toString() === req.params.classId || firstClass.name === req.params.classId) {
      classSub = {
        classId: firstClass._id,
        className: firstClass.name,
        group: firstClass.group || '',
        section: firstClass.section || '',
        displayName: firstClass.displayName,
        totalMarks: link.totalMarks,
        passingMarks: link.passingMarks,
        status: link.status,
        submittedAt: link.submittedAt,
      };
    }
  }

  // If not authorized for this subject link -> 403 Forbidden!
  if (!classSub) {
    throw new AppError('Class not authorized for this exam submission', 403);
  }

  const isAlreadySubmitted = classSub.status === 'SUBMITTED' || classSub.status === 'LOCKED';

  if (isAlreadySubmitted) {
    return ok(res, {
      alreadySubmitted: true,
      class: {
        _id: classSub.classId,
        name: classSub.className,
        group: classSub.group || '',
        section: classSub.section || '',
        displayName: classSub.displayName || formatDisplayName(classSub),
      },
      subject: {
        name: link.subjectName,
        totalMarks: classSub.totalMarks ?? link.totalMarks,
        passingMarks: classSub.passingMarks ?? link.passingMarks,
        allowSubmitterConfig: link.allowSubmitterConfig,
      },
      submittedAt: classSub.submittedAt || link.submittedAt,
      students: [],
    });
  }

  // Filter students belonging strictly to this class/group
  const classStudents = session.students.filter((s) => {
    if (s.classId && classSub.classId && s.classId.toString() === classSub.classId.toString()) return true;
    if (s.class === classSub.className) {
      if (!classSub.group) return true;
      return s.group === classSub.group;
    }
    return false;
  });

  const rosterStudents = classStudents.length > 0 ? classStudents : session.students;

  return ok(res, {
    alreadySubmitted: false,
    class: {
      _id: classSub.classId,
      name: classSub.className,
      group: classSub.group || '',
      section: classSub.section || '',
      displayName: classSub.displayName || formatDisplayName(classSub),
    },
    subject: {
      name: link.subjectName,
      totalMarks: classSub.totalMarks ?? link.totalMarks,
      passingMarks: classSub.passingMarks ?? link.passingMarks,
      allowSubmitterConfig: link.allowSubmitterConfig,
    },
    students: rosterStudents.map((s) => ({
      rollNumber: s.rollNumber,
      name: s.name,
      fatherName: s.fatherName,
    })),
  });
}

/**
 * POST /api/public/submissions/:token/classes/:classId
 * Submits marks for a single class under this subject.
 * Atomically validates that the class has not already been submitted.
 */
async function submitClassMarks(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const normClasses = normalizeClasses(session);

  let classSub = null;
  if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
    classSub = link.classSubmissions.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === req.params.classId) ||
        cs.className === req.params.classId ||
        cs.displayName === req.params.classId
    );
  } else {
    const firstClass = normClasses[0];
    if (firstClass._id.toString() === req.params.classId || firstClass.name === req.params.classId) {
      classSub = {
        classId: firstClass._id,
        className: firstClass.name,
        group: firstClass.group || '',
        section: firstClass.section || '',
        displayName: firstClass.displayName,
        totalMarks: link.totalMarks,
        passingMarks: link.passingMarks,
        status: link.status,
      };
    }
  }

  if (!classSub) {
    throw new AppError('Class not authorized for this exam submission', 403);
  }

  const classStudents = session.students.filter((s) => {
    if (s.classId && classSub.classId && s.classId.toString() === classSub.classId.toString()) return true;
    if (s.class === classSub.className) {
      if (!classSub.group) return true;
      return s.group === classSub.group;
    }
    return false;
  });
  const relevantStudents = classStudents.length > 0 ? classStudents : session.students;

  let totalMarks = classSub.totalMarks ?? link.totalMarks;
  let passingMarks = classSub.passingMarks ?? link.passingMarks;
  if (link.allowSubmitterConfig) {
    if (req.body.totalMarks !== undefined) totalMarks = req.body.totalMarks;
    if (req.body.passingMarks !== undefined) passingMarks = req.body.passingMarks;
    if (passingMarks > totalMarks) {
      throw new AppError('Passing marks cannot exceed total marks', 400);
    }
  }

  validateSubmissionMarks(relevantStudents, req.body.marks, totalMarks);
  for (const mark of req.body.marks) {
    if (
      typeof mark.obtained !== 'number' ||
      isNaN(mark.obtained) ||
      mark.obtained < 0 ||
      mark.obtained > totalMarks
    ) {
      throw new AppError(`Marks for roll number ${mark.rollNumber} must be between 0 and ${totalMarks}`, 400);
    }
  }

  // 1. Try atomic update if classSubmissions contains this class entry with status PENDING
  let updated = await SubjectSubmission.findOneAndUpdate(
    {
      _id: link._id,
      status: { $ne: 'DISABLED' },
      'classSubmissions.classId': classSub.classId,
      'classSubmissions.status': 'PENDING',
    },
    {
      $set: {
        'classSubmissions.$.status': 'SUBMITTED',
        'classSubmissions.$.marks': req.body.marks,
        'classSubmissions.$.submittedVia': 'public',
        'classSubmissions.$.submittedAt': new Date(),
        'classSubmissions.$.totalMarks': totalMarks,
        'classSubmissions.$.passingMarks': passingMarks,
      },
    },
    { new: true }
  );

  // 2. If no matching entry found, check if it was already submitted/locked
  if (!updated) {
    const current = await SubjectSubmission.findById(link._id);
    const existingEntry = current?.classSubmissions?.find(
      (cs) => cs.classId && cs.classId.toString() === classSub.classId.toString()
    );

    if (existingEntry && (existingEntry.status === 'SUBMITTED' || existingEntry.status === 'LOCKED')) {
      throw new AppError(
        `${link.subjectName} for ${classSub.displayName || classSub.className} has already been submitted`,
        409
      );
    }

    // Fallback for legacy single-class schema
    updated = await SubjectSubmission.findOneAndUpdate(
      { _id: link._id, status: 'PENDING' },
      {
        $set: {
          totalMarks,
          passingMarks,
          marks: req.body.marks,
          status: 'SUBMITTED',
          submittedVia: 'public',
          submittedAt: new Date(),
          classSubmissions: [
            {
              classId: classSub.classId,
              className: classSub.className,
              group: classSub.group || '',
              section: classSub.section || '',
              displayName: classSub.displayName,
              status: 'SUBMITTED',
              marks: req.body.marks,
              submittedVia: 'public',
              submittedAt: new Date(),
            },
          ],
        },
      },
      { new: true }
    );
  }

  if (!updated) {
    throw new AppError(
      `${link.subjectName} for ${classSub.displayName || classSub.className} has already been submitted`,
      409
    );
  }

  // Check if ALL authorized classes for this subject are now submitted
  const submittedClasses = updated.classSubmissions.filter(
    (cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED'
  );
  const isAllSubmitted = submittedClasses.length >= updated.classSubmissions.length;
  updated.status = isAllSubmitted ? 'SUBMITTED' : 'IN_PROGRESS';
  await updated.save();

  const remainingClasses = updated.classSubmissions.filter((cs) => cs.status === 'PENDING');

  await logActivity({
    userId: null,
    action: 'SUBJECT_CLASS_SUBMITTED_PUBLIC',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      subjectId: link.subjectId,
      subjectName: link.subjectName,
      classId: classSub.classId,
      className: classSub.className,
      group: classSub.group || '',
      studentCount: req.body.marks.length,
    },
  });

  return ok(
    res,
    {
      className: classSub.displayName || classSub.className,
      remainingClassesCount: remainingClasses.length,
      nextClass: remainingClasses[0] || null,
      isAllClassesSubmitted: isAllSubmitted,
    },
    `${classSub.displayName || classSub.className} ${link.subjectName} results submitted successfully`
  );
}

/**
 * Legacy endpoint: POST /api/public/submissions/:token/submit
 * Routes to the first authorized class for backward compatibility.
 */
async function submitMarks(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const targetClass = link.classSubmissions?.[0] || normalizeClasses(session)[0];
  if (!targetClass) {
    throw new AppError('No classes found for this exam', 400);
  }
  req.params.classId = (targetClass.classId || targetClass._id).toString();
  return submitClassMarks(req, res);
}

module.exports = { getSubmissionInfo, getClassRoster, submitClassMarks, submitMarks };
