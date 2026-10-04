const { SubjectSubmission } = require('../models');

function normalizeClasses(session) {
  if (Array.isArray(session.classes) && session.classes.length > 0) {
    return session.classes;
  }
  return [
    {
      _id: session._id,
      name: session.class || 'Default Class',
      section: session.section || '',
      finalResultId: session.finalResultId || null,
    },
  ];
}

/**
 * Merges each subject's real link record (status, token, submitted info,
 * and per-class submission breakdown) into a session's subjects array.
 */
async function attachSubmissionStatus(sessionDoc) {
  const session = typeof sessionDoc.toObject === 'function' ? sessionDoc.toObject() : sessionDoc;
  session.classes = normalizeClasses(session);

  const submissions = await SubjectSubmission.find({ resultSession: session._id })
    .select('subjectId status submissionToken totalMarks passingMarks allowSubmitterConfig classSubmissions marks submittedAt submittedVia createdAt')
    .lean();
  const byId = new Map(submissions.map((s) => [s.subjectId.toString(), s]));

  const classStudentsMap = new Map();
  session.classes.forEach((c) => {
    const count = session.students.filter(
      (s) => (s.classId && s.classId.toString() === c._id.toString()) || (s.class && s.class === c.name)
    ).length;
    classStudentsMap.set(c._id.toString(), count > 0 ? count : session.students.length);
  });

  session.subjects = session.subjects.map((subj) => {
    const link = byId.get(subj._id.toString());
    if (!link) {
      return {
        ...subj,
        linkStatus: null,
        submitted: false,
        submissionToken: null,
        classesSubmitted: 0,
        totalClasses: session.classes.length,
        classSubmissions: session.classes.map((c) => ({
          classId: c._id,
          className: c.name,
          section: c.section || '',
          status: 'PENDING',
          studentCount: classStudentsMap.get(c._id.toString()) || 0,
          submittedCount: 0,
        })),
      };
    }

    let classSubs = [];
    if (Array.isArray(link.classSubmissions) && link.classSubmissions.length > 0) {
      classSubs = session.classes.map((c) => {
        const found = link.classSubmissions.find(
          (cs) => cs.classId && cs.classId.toString() === c._id.toString() || cs.className === c.name
        );
        const studentTotal = classStudentsMap.get(c._id.toString()) || 0;
        return {
          _id: found?._id || c._id,
          classId: c._id,
          className: c.name,
          section: c.section || '',
          status: found?.status || 'PENDING',
          marks: found?.marks || [],
          studentCount: studentTotal,
          submittedCount: found?.marks?.length || 0,
          submittedAt: found?.submittedAt || null,
          submittedVia: found?.submittedVia || null,
        };
      });
    } else {
      // Legacy fallback
      const singleClass = session.classes[0];
      const isSub = link.status === 'SUBMITTED' || link.status === 'LOCKED';
      classSubs = [
        {
          _id: link._id,
          classId: singleClass?._id || session._id,
          className: singleClass?.name || session.class,
          section: singleClass?.section || session.section || '',
          status: isSub ? link.status : 'PENDING',
          marks: link.marks || [],
          studentCount: session.students.length,
          submittedCount: link.marks?.length || 0,
          submittedAt: link.submittedAt || null,
          submittedVia: link.submittedVia || null,
        },
      ];
    }

    const classesSubmitted = classSubs.filter((cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED').length;
    const isComplete = classesSubmitted === session.classes.length && session.classes.length > 0;
    const computedStatus =
      link.status === 'DISABLED'
        ? 'DISABLED'
        : isComplete
        ? 'SUBMITTED'
        : classesSubmitted > 0
        ? 'IN_PROGRESS'
        : 'PENDING';

    return {
      ...subj,
      linkStatus: link.status,
      overallStatus: computedStatus,
      submitted: isComplete,
      submissionToken: link.submissionToken || null,
      submittedAt: link.submittedAt || null,
      submittedVia: link.submittedVia || null,
      linkCreatedAt: link.createdAt || null,
      classesSubmitted,
      totalClasses: session.classes.length,
      classSubmissions: classSubs,
    };
  });

  session.submittedCount = session.subjects.filter((s) => s.submitted).length;
  return session;
}

// Batched submittedCount for a list of sessions (avoids N+1 queries).
async function attachSubmissionCounts(sessions) {
  if (sessions.length === 0) return sessions;
  sessions.forEach((s) => {
    s.classes = normalizeClasses(s);
  });
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
 * Builds the per-student inspection view for one submitted subject.
 * If classId is specified, builds for that specific class.
 */
function buildSubmissionView(session, submission, classId = null) {
  const normClasses = normalizeClasses(session);
  let targetClass = null;
  if (classId) {
    targetClass = normClasses.find((c) => c._id.toString() === classId.toString() || c.name === classId);
  }

  let classSub = null;
  if (targetClass && Array.isArray(submission.classSubmissions) && submission.classSubmissions.length > 0) {
    classSub = submission.classSubmissions.find(
      (cs) => (cs.classId && cs.classId.toString() === targetClass._id.toString()) || cs.className === targetClass.name
    );
  }

  const marksList = classSub?.marks || (submission.marks && submission.marks.length > 0 ? submission.marks : []);
  const classStudents = targetClass
    ? session.students.filter(
        (s) =>
          (s.classId && s.classId.toString() === targetClass._id.toString()) ||
          (s.class && s.class === targetClass.name)
      )
    : session.students;

  const relevantStudents = classStudents.length > 0 ? classStudents : session.students;
  const nameByRoll = new Map(relevantStudents.map((s) => [s.rollNumber, s]));

  const rows = marksList
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
    className: targetClass?.name || session.class,
    classId: targetClass?._id,
    totalMarks: submission.totalMarks,
    passingMarks: submission.passingMarks,
    submittedAt: classSub?.submittedAt || submission.submittedAt,
    submittedVia: classSub?.submittedVia || submission.submittedVia,
    status: classSub?.status || submission.status,
    rows,
  };
}

module.exports = { attachSubmissionStatus, attachSubmissionCounts, buildSubmissionView, normalizeClasses };
