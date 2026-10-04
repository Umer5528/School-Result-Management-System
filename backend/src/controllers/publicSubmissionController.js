const { SubjectSubmission, ResultSession } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { validateSubmissionMarks } = require('../services/resultCalculationService');
const { logActivity } = require('../services/activityLogService');
const { normalizeClasses } = require('../services/resultSessionViewService');

/**
 * Finds and validates the SubjectSubmission and associated ResultSession by token.
 * Validates that the link exists, is not disabled, and the session is valid.
 */
async function findLinkByToken(token) {
  const link = await SubjectSubmission.findOne({ submissionToken: token });
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
 * Returns exam details, subject details, and the authorized classes for this exam.
 * Does NOT expose students of all classes up-front or any unrelated exams/classes.
 */
async function getSubmissionInfo(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const classes = normalizeClasses(session);

  const classesSummary = classes.map((c) => {
    let classSub = null;
    if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
      classSub = link.classSubmissions.find(
        (cs) => (cs.classId && cs.classId.toString() === c._id.toString()) || cs.className === c.name
      );
    }

    const studentCount = session.students.filter(
      (s) => (s.classId && s.classId.toString() === c._id.toString()) || (s.class && s.class === c.name)
    ).length;

    const status = classSub
      ? classSub.status
      : link.status === 'SUBMITTED' || link.status === 'LOCKED'
      ? link.status
      : 'PENDING';

    return {
      _id: c._id,
      name: c.name,
      section: c.section || '',
      status,
      submittedAt: classSub?.submittedAt || link.submittedAt,
      studentCount: studentCount > 0 ? studentCount : session.students.length,
    };
  });

  const submittedClassesCount = classesSummary.filter(
    (c) => c.status === 'SUBMITTED' || c.status === 'LOCKED'
  ).length;
  const isComplete = submittedClassesCount === classes.length && classes.length > 0;
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
 * Validates that classId belongs to this exam link.
 */
async function getClassRoster(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const classes = normalizeClasses(session);

  const targetClass = classes.find(
    (c) => c._id.toString() === req.params.classId || c.name === req.params.classId
  );
  if (!targetClass) {
    throw new AppError('Class not authorized for this exam submission', 403);
  }

  // Check if this class is already submitted
  let classSub = null;
  if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
    classSub = link.classSubmissions.find(
      (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
    );
  }

  const isAlreadySubmitted = classSub
    ? classSub.status === 'SUBMITTED' || classSub.status === 'LOCKED'
    : link.status === 'SUBMITTED' || link.status === 'LOCKED';

  if (isAlreadySubmitted) {
    return ok(res, {
      alreadySubmitted: true,
      class: {
        _id: targetClass._id,
        name: targetClass.name,
        section: targetClass.section || '',
      },
      subject: {
        name: link.subjectName,
        totalMarks: link.totalMarks,
        passingMarks: link.passingMarks,
        allowSubmitterConfig: link.allowSubmitterConfig,
      },
      submittedAt: classSub?.submittedAt || link.submittedAt,
      students: [],
    });
  }

  // Filter students belonging strictly to this class
  let classStudents = session.students.filter(
    (s) =>
      (s.classId && s.classId.toString() === targetClass._id.toString()) ||
      (s.class && s.class === targetClass.name)
  );
  if (classStudents.length === 0 && classes.length === 1) {
    classStudents = session.students;
  }

  return ok(res, {
    alreadySubmitted: false,
    class: {
      _id: targetClass._id,
      name: targetClass.name,
      section: targetClass.section || '',
    },
    subject: {
      name: link.subjectName,
      totalMarks: link.totalMarks,
      passingMarks: link.passingMarks,
      allowSubmitterConfig: link.allowSubmitterConfig,
    },
    students: classStudents.map((s) => ({
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
  const classes = normalizeClasses(session);

  const targetClass = classes.find(
    (c) => c._id.toString() === req.params.classId || c.name === req.params.classId
  );
  if (!targetClass) {
    throw new AppError('Class not authorized for this exam submission', 403);
  }

  let classStudents = session.students.filter(
    (s) =>
      (s.classId && s.classId.toString() === targetClass._id.toString()) ||
      (s.class && s.class === targetClass.name)
  );
  if (classStudents.length === 0 && classes.length === 1) {
    classStudents = session.students;
  }

  let totalMarks = link.totalMarks;
  let passingMarks = link.passingMarks;
  if (link.allowSubmitterConfig) {
    if (req.body.totalMarks !== undefined) totalMarks = req.body.totalMarks;
    if (req.body.passingMarks !== undefined) passingMarks = req.body.passingMarks;
    if (passingMarks > totalMarks) {
      throw new AppError('Passing marks cannot exceed total marks', 400);
    }
  }

  validateSubmissionMarks(classStudents, req.body.marks, totalMarks);
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

  // 1. Try atomic update if classSubmissions already contains this class entry with status PENDING
  let updated = await SubjectSubmission.findOneAndUpdate(
    {
      _id: link._id,
      status: { $ne: 'DISABLED' },
      'classSubmissions.classId': targetClass._id,
      'classSubmissions.status': 'PENDING',
    },
    {
      $set: {
        'classSubmissions.$.status': 'SUBMITTED',
        'classSubmissions.$.marks': req.body.marks,
        'classSubmissions.$.submittedVia': 'public',
        'classSubmissions.$.submittedAt': new Date(),
        totalMarks,
        passingMarks,
      },
    },
    { new: true }
  );

  // 2. If no matching entry found, check if it's because it was already SUBMITTED/LOCKED
  if (!updated) {
    const current = await SubjectSubmission.findById(link._id);
    const existingEntry = current?.classSubmissions?.find(
      (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
    );

    if (existingEntry && (existingEntry.status === 'SUBMITTED' || existingEntry.status === 'LOCKED')) {
      throw new AppError(`${link.subjectName} for ${targetClass.name} has already been submitted`, 409);
    }

    // If entry does not exist yet (e.g. unprovisioned entry), push it
    updated = await SubjectSubmission.findOneAndUpdate(
      {
        _id: link._id,
        status: { $ne: 'DISABLED' },
        'classSubmissions.classId': { $ne: targetClass._id },
      },
      {
        $push: {
          classSubmissions: {
            classId: targetClass._id,
            className: targetClass.name,
            section: targetClass.section || '',
            status: 'SUBMITTED',
            marks: req.body.marks,
            submittedVia: 'public',
            submittedAt: new Date(),
          },
        },
        $set: { totalMarks, passingMarks },
      },
      { new: true }
    );
  }

  // 3. Fallback for older legacy single-class schema
  if (!updated) {
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
              classId: targetClass._id,
              className: targetClass.name,
              section: targetClass.section || '',
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
    throw new AppError(`${link.subjectName} for ${targetClass.name} has already been submitted`, 409);
  }

  // Check if ALL classes for this subject are now submitted
  const submittedClasses = updated.classSubmissions.filter(
    (cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED'
  );
  const isAllSubmitted = submittedClasses.length >= classes.length;
  updated.status = isAllSubmitted ? 'SUBMITTED' : 'IN_PROGRESS';
  await updated.save();

  // Find remaining pending classes
  const remainingClasses = classes.filter((c) => {
    const cs = updated.classSubmissions.find(
      (sub) => (sub.classId && sub.classId.toString() === c._id.toString()) || sub.className === c.name
    );
    return !cs || cs.status === 'PENDING';
  });

  await logActivity({
    userId: null,
    action: 'SUBJECT_CLASS_SUBMITTED_PUBLIC',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      subjectId: link.subjectId,
      subjectName: link.subjectName,
      classId: targetClass._id,
      className: targetClass.name,
      studentCount: req.body.marks.length,
    },
  });

  return ok(
    res,
    {
      className: targetClass.name,
      remainingClassesCount: remainingClasses.length,
      nextClass: remainingClasses[0] || null,
      isAllClassesSubmitted: isAllSubmitted,
    },
    `${targetClass.name} ${link.subjectName} results submitted successfully`
  );
}

/**
 * Legacy endpoint: POST /api/public/submissions/:token/submit
 * Routes to the first class in the exam for backward compatibility.
 */
async function submitMarks(req, res) {
  const { link, session } = await findLinkByToken(req.params.token);
  const classes = normalizeClasses(session);
  const targetClass = classes[0];
  if (!targetClass) {
    throw new AppError('No classes found for this exam', 400);
  }
  req.params.classId = targetClass._id.toString();
  return submitClassMarks(req, res);
}

module.exports = { getSubmissionInfo, getClassRoster, submitClassMarks, submitMarks };

