const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateResult,
  assignPositions,
  validateSubjects,
  validateSubmissionMarks,
  effectiveStatus,
  recomputePassFailStatistics,
} = require('../src/services/resultCalculationService');

test('calculateResult: totals, percentage, and PASS/FAIL are per-subject, not overall %', () => {
  const subjects = [
    { name: 'Math', totalMarks: 100, passingMarks: 40 },
    { name: 'English', totalMarks: 100, passingMarks: 40 },
  ];
  const students = [
    { rollNumber: '1', name: 'Ali', marks: [{ subject: 'Math', obtained: 90 }, { subject: 'English', obtained: 90 }] },
    // Fails Math despite a 60% overall average -- this is the exact
    // real-world question a user asked earlier in this project.
    { rollNumber: '2', name: 'Usman', marks: [{ subject: 'Math', obtained: 30 }, { subject: 'English', obtained: 90 }] },
  ];

  const { students: out } = calculateResult({ subjects, students, expectedStrength: 2 });
  const ali = out.find((s) => s.name === 'Ali');
  const usman = out.find((s) => s.name === 'Usman');

  assert.equal(ali.totalObtained, 180);
  assert.equal(ali.percentage, 90);
  assert.equal(ali.status, 'PASS');

  assert.equal(usman.totalObtained, 120);
  assert.equal(usman.percentage, 60);
  assert.equal(usman.status, 'FAIL', 'must fail overall despite 60% average, because Math (30) < passing (40)');
  assert.deepEqual(usman.failedSubjects, ['Math']);
});

test('calculateResult / assignPositions: competition ranking handles ties correctly (1,1,3 not 1,1,2)', () => {
  const subjects = [{ name: 'Math', totalMarks: 100, passingMarks: 40 }];
  const students = [
    { rollNumber: '1', name: 'A', marks: [{ subject: 'Math', obtained: 90 }] },
    { rollNumber: '2', name: 'B', marks: [{ subject: 'Math', obtained: 90 }] }, // tied with A
    { rollNumber: '3', name: 'C', marks: [{ subject: 'Math', obtained: 80 }] },
  ];
  const { students: out } = calculateResult({ subjects, students, expectedStrength: 3 });
  const byName = Object.fromEntries(out.map((s) => [s.name, s.position]));
  assert.equal(byName.A, 1);
  assert.equal(byName.B, 1);
  assert.equal(byName.C, 3, 'position must skip to 3, never 2, after a two-way tie for 1st');
});

test('assignPositions: does not mutate input array order, returns a new sorted array', () => {
  const students = [
    { rollNumber: '1', totalObtained: 50 },
    { rollNumber: '2', totalObtained: 90 },
  ];
  const sorted = assignPositions(students);
  assert.equal(sorted[0].rollNumber, '2', 'highest total must come first after sorting');
  assert.equal(students[0].rollNumber, '1', 'original array order must be untouched');
});

test('calculateResult: rejects student count that does not match expectedStrength', () => {
  const subjects = [{ name: 'Math', totalMarks: 100, passingMarks: 40 }];
  const students = [{ rollNumber: '1', name: 'A', marks: [{ subject: 'Math', obtained: 50 }] }];
  assert.throws(() => calculateResult({ subjects, students, expectedStrength: 2 }), /Expected 2 student records/);
});

test('calculateResult: rejects a mark outside 0..totalMarks bounds', () => {
  const subjects = [{ name: 'Math', totalMarks: 100, passingMarks: 40 }];
  const students = [{ rollNumber: '1', name: 'A', marks: [{ subject: 'Math', obtained: 150 }] }];
  assert.throws(() => calculateResult({ subjects, students, expectedStrength: 1 }), /must be between 0 and 100/);
});

test('validateSubjects: rejects passingMarks greater than totalMarks', () => {
  assert.throws(
    () => validateSubjects([{ name: 'Math', totalMarks: 50, passingMarks: 60 }]),
    /cannot exceed total marks/
  );
});

test('validateSubjects: rejects duplicate subject names', () => {
  assert.throws(
    () =>
      validateSubjects([
        { name: 'Math', totalMarks: 100, passingMarks: 40 },
        { name: 'math', totalMarks: 50, passingMarks: 20 }, // case-insensitive duplicate
      ]),
    /Duplicate subject name/
  );
});

test('validateSubmissionMarks: rejects a public/teacher submission whose roster does not exactly match the session', () => {
  const sessionStudents = [{ rollNumber: '1' }, { rollNumber: '2' }];
  assert.throws(
    () => validateSubmissionMarks(sessionStudents, [{ rollNumber: '1', obtained: 50 }], 100),
    /must cover exactly the students/,
    'missing a student must be rejected'
  );
  assert.throws(
    () =>
      validateSubmissionMarks(
        sessionStudents,
        [{ rollNumber: '1', obtained: 50 }, { rollNumber: '2', obtained: 50 }, { rollNumber: '3', obtained: 50 }],
        100
      ),
    /must cover exactly the students/,
    'an extra roll number not in the session must be rejected'
  );
});

test('validateSubmissionMarks: accepts an exact roster match within bounds', () => {
  const sessionStudents = [{ rollNumber: '1' }, { rollNumber: '2' }];
  assert.doesNotThrow(() =>
    validateSubmissionMarks(sessionStudents, [{ rollNumber: '1', obtained: 50 }, { rollNumber: '2', obtained: 100 }], 100)
  );
});

test('effectiveStatus: an override wins over the calculated status, but never replaces it', () => {
  const student = { status: 'FAIL', overriddenStatus: null };
  assert.equal(effectiveStatus(student), 'FAIL', 'no override -> calculated status stands');

  student.overriddenStatus = 'PASS';
  assert.equal(effectiveStatus(student), 'PASS', 'override wins for display purposes');
  assert.equal(student.status, 'FAIL', 'the calculated status itself is never mutated by an override');
});

test('recomputePassFailStatistics: counts by EFFECTIVE status, exactly the "61% but failed" scenario', () => {
  const students = [
    { status: 'PASS', overriddenStatus: null },
    // Failed Chemistry despite 61% overall -- then the teacher overrides to PASS.
    { status: 'FAIL', overriddenStatus: 'PASS' },
    { status: 'FAIL', overriddenStatus: null },
  ];
  const stats = recomputePassFailStatistics(students);
  assert.equal(stats.passed, 2, 'the overridden student now counts as passed');
  assert.equal(stats.failed, 1);
  assert.equal(stats.passPercentage, 66.67);
});


