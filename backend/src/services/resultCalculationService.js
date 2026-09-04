const AppError = require('../utils/appError');

/**
 * The single source of truth for turning raw subject config + raw student
 * marks into a fully calculated Result. Called on both create and update
 * so a client can never persist a manipulated total, percentage, pass/fail
 * status, or position — see Module 47 of the spec ("never trust values
 * calculated only by React").
 */
function validateSubjects(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new AppError('At least one subject is required', 400);
  }
  const seen = new Set();
  for (const s of subjects) {
    if (!s.name || !s.name.trim()) throw new AppError('Every subject needs a name', 400);
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) throw new AppError(`Duplicate subject name: ${s.name}`, 400);
    seen.add(key);
    if (!(s.totalMarks > 0)) throw new AppError(`${s.name}: total marks must be positive`, 400);
    if (!(s.passingMarks >= 0)) throw new AppError(`${s.name}: passing marks must be positive`, 400);
    if (s.passingMarks > s.totalMarks) {
      throw new AppError(`${s.name}: passing marks cannot exceed total marks`, 400);
    }
  }
}

/**
 * Shared by the public submission flow and the teacher's edit-marks flow
 * (Change Modules 5 & 7) -- one subject's marks must cover exactly the
 * session's own student roster, and every mark must be within bounds.
 * Kept here rather than duplicated in each controller.
 */
function validateSubmissionMarks(sessionStudents, marks, totalMarks) {
  const expectedRolls = new Set(sessionStudents.map((s) => s.rollNumber));
  const submittedRolls = new Set(marks.map((m) => m.rollNumber));
  if (expectedRolls.size !== submittedRolls.size || [...expectedRolls].some((r) => !submittedRolls.has(r))) {
    throw new AppError('Submitted marks must cover exactly the students in this result session', 400);
  }
  for (const mark of marks) {
    if (mark.obtained < 0 || mark.obtained > totalMarks) {
      throw new AppError(`Marks for roll number ${mark.rollNumber} must be between 0 and ${totalMarks}`, 400);
    }
  }
}

function validateStudents(students, subjects, expectedStrength) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new AppError('At least one student is required', 400);
  }
  if (expectedStrength && students.length !== expectedStrength) {
    throw new AppError(
      `Expected ${expectedStrength} student records but received ${students.length}`,
      400
    );
  }

  const subjectNames = subjects.map((s) => s.name.trim());
  const rollSeen = new Set();

  for (const student of students) {
    if (!student.rollNumber || !String(student.rollNumber).trim()) {
      throw new AppError('Every student needs a roll number', 400);
    }
    if (!student.name || !student.name.trim()) {
      throw new AppError(`Student with roll number ${student.rollNumber} is missing a name`, 400);
    }
    const rollKey = String(student.rollNumber).trim();
    if (rollSeen.has(rollKey)) {
      throw new AppError(`Duplicate roll number: ${rollKey}`, 400);
    }
    rollSeen.add(rollKey);

    const marksBySubject = new Map((student.marks || []).map((m) => [m.subject.trim(), m.obtained]));
    for (const subjectName of subjectNames) {
      if (!marksBySubject.has(subjectName)) {
        throw new AppError(`${student.name} (${rollKey}) is missing marks for ${subjectName}`, 400);
      }
    }
  }
}

/**
 * Competition ("1224") ranking: equal totals share the same position, and
 * the next distinct total's position skips ahead by the number of tied
 * students — e.g. 480, 480, 470 -> positions 1, 1, 3 (never 1, 1, 2).
 */
function assignPositions(students) {
  const sorted = [...students].sort((a, b) => b.totalObtained - a.totalObtained);
  let lastMarks = null;
  let lastPosition = 0;
  sorted.forEach((student, idx) => {
    if (student.totalObtained !== lastMarks) {
      lastPosition = idx + 1;
      lastMarks = student.totalObtained;
    }
    student.position = lastPosition;
  });
  return sorted;
}

function calculateResult({ subjects, students, expectedStrength }) {
  validateSubjects(subjects);
  validateStudents(students, subjects, expectedStrength);

  const totalMax = subjects.reduce((sum, s) => sum + s.totalMarks, 0);
  const passingBySubject = new Map(subjects.map((s) => [s.name.trim(), s.passingMarks]));

  const calculatedStudents = students.map((student) => {
    let totalObtained = 0;
    const failedSubjects = [];

    const marks = student.marks.map((m) => {
      const subject = m.subject.trim();
      const totalForSubject = subjects.find((s) => s.name.trim() === subject)?.totalMarks;
      const obtained = Number(m.obtained);

      if (obtained < 0 || obtained > totalForSubject) {
        throw new AppError(
          `${student.name}: marks for ${subject} must be between 0 and ${totalForSubject}`,
          400
        );
      }

      totalObtained += obtained;
      if (obtained < passingBySubject.get(subject)) {
        failedSubjects.push(subject);
      }
      return { subject, obtained };
    });

    const percentage = Math.round((totalObtained / totalMax) * 10000) / 100;

    return {
      rollNumber: String(student.rollNumber).trim(),
      name: student.name.trim(),
      fatherName: student.fatherName?.trim(),
      marks,
      totalObtained,
      totalMax,
      percentage,
      status: failedSubjects.length > 0 ? 'FAIL' : 'PASS',
      failedSubjects,
    };
  });

  const ranked = assignPositions(calculatedStudents);

  const passed = ranked.filter((s) => s.status === 'PASS').length;
  const failed = ranked.length - passed;
  const totals = ranked.map((s) => s.totalObtained);

  const statistics = {
    totalStudents: ranked.length,
    passed,
    failed,
    passPercentage: Math.round((passed / ranked.length) * 10000) / 100,
    highest: Math.max(...totals),
    lowest: Math.min(...totals),
    average: Math.round((totals.reduce((a, b) => a + b, 0) / ranked.length) * 100) / 100,
  };

  return { students: ranked, statistics, totalMax };
}

/**
 * "Effective" status for display/PDF/Excel/statistics purposes -- a
 * teacher's override (if any) wins, otherwise the calculated status
 * stands. Kept as one function so the PDF service, Excel service, and
 * the override endpoint's statistics recompute can never drift apart on
 * what "the real pass/fail" means for a given student.
 */
function effectiveStatus(student) {
  return student.overriddenStatus || student.status;
}

// Recomputes passed/failed/passPercentage from each student's EFFECTIVE
// status (post-override), leaving highest/lowest/average marks-based
// stats untouched since overrides don't change any marks.
function recomputePassFailStatistics(students) {
  const total = students.length;
  const passed = students.filter((s) => effectiveStatus(s) === 'PASS').length;
  return {
    passed,
    failed: total - passed,
    passPercentage: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
  };
}

module.exports = {
  calculateResult,
  assignPositions,
  validateSubjects,
  validateStudents,
  validateSubmissionMarks,
  effectiveStatus,
  recomputePassFailStatistics,
};
