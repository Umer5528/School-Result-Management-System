const mongoose = require('mongoose');
const { SubjectSubmission } = require('../models');

function formatDisplayName(c) {
  if (c.displayName) return c.displayName;
  const parts = [c.name];
  if (c.group) parts.push(c.group);
  if (c.section) parts.push(`(${c.section})`);
  return parts.join(' ');
}

function normalizeClasses(session) {
  if (Array.isArray(session.classes) && session.classes.length > 0) {
    return session.classes.map((c) => {
      const doc = typeof c.toObject === 'function' ? c.toObject() : { ...c };
      return {
        _id: doc._id || new mongoose.Types.ObjectId(),
        name: doc.name || session.class || 'Default Class',
        group: doc.group || '',
        section: doc.section || '',
        displayName: formatDisplayName(doc),
        subjects: Array.isArray(doc.subjects) && doc.subjects.length > 0 ? doc.subjects : (session.subjects || []),
        finalResultId: doc.finalResultId || null,
      };
    });
  }
  return [
    {
      _id: session._id,
      name: session.class || 'Default Class',
      group: session.group || '',
      section: session.section || '',
      displayName: session.class || 'Default Class',
      subjects: session.subjects || [],
      finalResultId: session.finalResultId || null,
    },
  ];
}

/**
 * Merges each subject's link record (status, token, submitted info,
 * and per-class submission breakdown) into session.classes and session.subjects.
 */
async function attachSubmissionStatus(sessionDoc) {
  const session = typeof sessionDoc.toObject === 'function' ? sessionDoc.toObject() : sessionDoc;
  session.classes = normalizeClasses(session);

  const submissions = await SubjectSubmission.find({ resultSession: session._id })
    .select(
      'subjectId subjectName status submissionToken totalMarks passingMarks allowSubmitterConfig classSubmissions marks submittedAt submittedVia createdAt'
    )
    .lean();

  // Map submissions by subjectId string AND by normalized subjectName
  const byId = new Map(submissions.map((s) => [s.subjectId.toString(), s]));
  const byName = new Map(submissions.map((s) => [s.subjectName.trim().toLowerCase(), s]));

  // Calculate student count per class/group
  const classStudentsMap = new Map();
  session.classes.forEach((c) => {
    const count = session.students.filter((s) => {
      if (s.classId && s.classId.toString() === c._id.toString()) return true;
      if (s.class === c.name) {
        if (!c.group) return true;
        return s.group === c.group;
      }
      return false;
    }).length;
    classStudentsMap.set(c._id.toString(), count > 0 ? count : session.students.length);
  });

  // 1. Decorate each class with its configured subjects and status breakdown
  session.classes = session.classes.map((c) => {
    const classStudentTotal = classStudentsMap.get(c._id.toString()) || 0;
    const configuredSubjects = (c.subjects || []).map((subj) => {
      const link = byId.get(subj._id?.toString()) || byName.get(subj.name.trim().toLowerCase());
      let classSub = null;
      if (link && Array.isArray(link.classSubmissions)) {
        classSub = link.classSubmissions.find(
          (cs) =>
            (cs.classId && cs.classId.toString() === c._id.toString()) ||
            (cs.className === c.name && (cs.group || '') === (c.group || ''))
        );
      }

      const status = classSub
        ? classSub.status
        : link
        ? link.status === 'DISABLED'
          ? 'DISABLED'
          : link.status === 'SUBMITTED' || link.status === 'LOCKED'
          ? link.status
          : 'PENDING'
        : 'PENDING';

      return {
        _id: subj._id,
        linkSubjectId: link?.subjectId || subj._id,
        name: subj.name,
        totalMarks: classSub?.totalMarks ?? subj.totalMarks,
        passingMarks: classSub?.passingMarks ?? subj.passingMarks,
        allowSubmitterConfig: !!subj.allowSubmitterConfig,
        status,
        submitted: status === 'SUBMITTED' || status === 'LOCKED',
        submissionToken: link?.submissionToken || null,
        studentCount: classStudentTotal,
        submittedCount: classSub?.marks?.length || 0,
        submittedAt: classSub?.submittedAt || link?.submittedAt || null,
        submittedVia: classSub?.submittedVia || link?.submittedVia || null,
      };
    });

    const submittedSubjectsCount = configuredSubjects.filter((s) => s.submitted).length;
    const configuredSubjectsCount = configuredSubjects.length;
    const pendingSubjectsCount = configuredSubjectsCount - submittedSubjectsCount;
    const completionPercentage =
      configuredSubjectsCount > 0 ? Math.round((submittedSubjectsCount / configuredSubjectsCount) * 100) : 0;

    return {
      ...c,
      studentCount: classStudentTotal,
      subjects: configuredSubjects,
      configuredSubjectsCount,
      submittedSubjectsCount,
      pendingSubjectsCount,
      isClassFinalized: !!c.finalResultId,
      completionPercentage,
    };
  });

  // 2. Build the unified subject links list (covering only the classes each subject is configured for)
  // Gather unique subjects across all classes
  const subjectMap = new Map();
  session.classes.forEach((c) => {
    (c.subjects || []).forEach((s) => {
      const key = s.name.trim().toLowerCase();
      if (!subjectMap.has(key)) {
        subjectMap.set(key, {
          _id: s._id,
          name: s.name,
          totalMarks: s.totalMarks,
          passingMarks: s.passingMarks,
          allowSubmitterConfig: s.allowSubmitterConfig,
          classes: [],
        });
      }
      subjectMap.get(key).classes.push(c);
    });
  });

  // If no per-class subjects were gathered (legacy fallback), use top-level session.subjects
  if (subjectMap.size === 0 && Array.isArray(session.subjects)) {
    session.subjects.forEach((s) => {
      const key = s.name.trim().toLowerCase();
      subjectMap.set(key, {
        ...s,
        classes: session.classes,
      });
    });
  }

  session.subjects = Array.from(subjectMap.values()).map((subjMeta) => {
    const link = byId.get(subjMeta._id?.toString()) || byName.get(subjMeta.name.trim().toLowerCase());
    const authorizedClasses = subjMeta.classes;

    if (!link) {
      return {
        _id: subjMeta._id,
        name: subjMeta.name,
        totalMarks: subjMeta.totalMarks,
        passingMarks: subjMeta.passingMarks,
        allowSubmitterConfig: !!subjMeta.allowSubmitterConfig,
        linkStatus: null,
        overallStatus: 'PENDING',
        submitted: false,
        submissionToken: null,
        classesSubmitted: 0,
        totalClasses: authorizedClasses.length,
        classSubmissions: authorizedClasses.map((c) => ({
          classId: c._id,
          className: c.name,
          group: c.group || '',
          section: c.section || '',
          displayName: c.displayName,
          status: 'PENDING',
          studentCount: classStudentsMap.get(c._id.toString()) || 0,
          submittedCount: 0,
        })),
      };
    }

    // Map authorized class submissions
    const classSubs = authorizedClasses.map((c) => {
      let found = null;
      if (Array.isArray(link.classSubmissions)) {
        found = link.classSubmissions.find(
          (cs) =>
            (cs.classId && cs.classId.toString() === c._id.toString()) ||
            (cs.className === c.name && (cs.group || '') === (c.group || ''))
        );
      }
      const studentTotal = classStudentsMap.get(c._id.toString()) || 0;
      const subStatus = found?.status || (link.status === 'SUBMITTED' || link.status === 'LOCKED' ? link.status : 'PENDING');
      return {
        _id: found?._id || c._id,
        classId: c._id,
        className: c.name,
        group: c.group || '',
        section: c.section || '',
        displayName: c.displayName,
        totalMarks: found?.totalMarks ?? link.totalMarks,
        passingMarks: found?.passingMarks ?? link.passingMarks,
        status: subStatus,
        marks: found?.marks || [],
        studentCount: studentTotal,
        submittedCount: found?.marks?.length || 0,
        submittedAt: found?.submittedAt || link.submittedAt || null,
        submittedVia: found?.submittedVia || link.submittedVia || null,
      };
    });

    const classesSubmitted = classSubs.filter((cs) => cs.status === 'SUBMITTED' || cs.status === 'LOCKED').length;
    const isComplete = classesSubmitted === authorizedClasses.length && authorizedClasses.length > 0;
    const computedStatus =
      link.status === 'DISABLED'
        ? 'DISABLED'
        : isComplete
        ? 'SUBMITTED'
        : classesSubmitted > 0
        ? 'IN_PROGRESS'
        : 'PENDING';

    return {
      _id: subjMeta._id,
      name: subjMeta.name,
      totalMarks: link.totalMarks ?? subjMeta.totalMarks,
      passingMarks: link.passingMarks ?? subjMeta.passingMarks,
      allowSubmitterConfig: link.allowSubmitterConfig ?? subjMeta.allowSubmitterConfig,
      linkStatus: link.status,
      overallStatus: computedStatus,
      submitted: isComplete,
      submissionToken: link.submissionToken || null,
      submittedAt: link.submittedAt || null,
      submittedVia: link.submittedVia || null,
      linkCreatedAt: link.createdAt || null,
      classesSubmitted,
      totalClasses: authorizedClasses.length,
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
    targetClass = normClasses.find(
      (c) =>
        c._id.toString() === classId.toString() ||
        c.name === classId ||
        c.displayName === classId
    );
  }

  let classSub = null;
  if (targetClass && Array.isArray(submission.classSubmissions) && submission.classSubmissions.length > 0) {
    classSub = submission.classSubmissions.find(
      (cs) =>
        (cs.classId && cs.classId.toString() === targetClass._id.toString()) ||
        (cs.className === targetClass.name && (cs.group || '') === (targetClass.group || ''))
    );
  }

  const marksList = classSub?.marks || (submission.marks && submission.marks.length > 0 ? submission.marks : []);
  const classStudents = targetClass
    ? session.students.filter((s) => {
        if (s.classId && s.classId.toString() === targetClass._id.toString()) return true;
        if (s.class === targetClass.name) {
          if (!targetClass.group) return true;
          return s.group === targetClass.group;
        }
        return false;
      })
    : session.students;

  const relevantStudents = classStudents.length > 0 ? classStudents : session.students;
  const nameByRoll = new Map(relevantStudents.map((s) => [s.rollNumber, s]));

  const targetTotalMarks = classSub?.totalMarks ?? submission.totalMarks;
  const targetPassingMarks = classSub?.passingMarks ?? submission.passingMarks;

  const rows = marksList
    .map((m) => {
      const student = nameByRoll.get(m.rollNumber);
      return {
        rollNumber: m.rollNumber,
        name: student?.name || '(unknown)',
        fatherName: student?.fatherName,
        obtained: m.obtained,
        totalMarks: targetTotalMarks,
        status: m.obtained >= targetPassingMarks ? 'PASS' : 'FAIL',
      };
    })
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));

  return {
    subjectName: submission.subjectName,
    className: targetClass?.displayName || targetClass?.name || session.class,
    classId: targetClass?._id,
    group: targetClass?.group || '',
    section: targetClass?.section || '',
    totalMarks: targetTotalMarks,
    passingMarks: targetPassingMarks,
    submittedAt: classSub?.submittedAt || submission.submittedAt,
    submittedVia: classSub?.submittedVia || submission.submittedVia,
    status: classSub?.status || submission.status,
    rows,
  };
}

module.exports = {
  attachSubmissionStatus,
  attachSubmissionCounts,
  buildSubmissionView,
  normalizeClasses,
  formatDisplayName,
};
