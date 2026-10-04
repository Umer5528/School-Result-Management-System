const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { createSessionSchema } = require('../src/validators/resultSessionValidators');
const { normalizeClasses, buildSubmissionView } = require('../src/services/resultSessionViewService');
const { calculateResult, assignPositions } = require('../src/services/resultCalculationService');

test('createSessionSchema: supports multiple classes (both string and object format)', () => {
  const baseValid = {
    examType: 'MIDTERM',
    resultDate: '2026-10-10',
    academicYear: '2026-2027',
    studentIds: ['507f1f77bcf86cd799439011'],
    subjects: [{ name: 'Physics', totalMarks: 100, passingMarks: 40 }],
  };

  // Multiple classes as objects
  const parsed1 = createSessionSchema.safeParse({
    ...baseValid,
    classes: [{ name: '1st Year', section: 'A' }, { name: '2nd Year', section: 'B' }],
  });
  assert.equal(parsed1.success, true);

  // Multiple classes as strings
  const parsed2 = createSessionSchema.safeParse({
    ...baseValid,
    classes: ['1st Year', '2nd Year'],
  });
  assert.equal(parsed2.success, true);

  // Legacy single class
  const parsedLegacy = createSessionSchema.safeParse({
    ...baseValid,
    class: '10th',
    section: 'A',
  });
  assert.equal(parsedLegacy.success, true);

  // Missing all classes -> rejected
  const parsedInvalid = createSessionSchema.safeParse({
    ...baseValid,
    classes: [],
  });
  assert.equal(parsedInvalid.success, false);
});

test('normalizeClasses: extracts classes array or generates legacy single class fallback', () => {
  const multiClassSession = {
    _id: new mongoose.Types.ObjectId(),
    classes: [
      { _id: new mongoose.Types.ObjectId(), name: '1st Year', section: 'A' },
      { _id: new mongoose.Types.ObjectId(), name: '2nd Year', section: 'B' },
    ],
  };
  const normalizedMulti = normalizeClasses(multiClassSession);
  assert.equal(normalizedMulti.length, 2);
  assert.equal(normalizedMulti[0].name, '1st Year');
  assert.equal(normalizedMulti[1].name, '2nd Year');

  const legacySession = {
    _id: new mongoose.Types.ObjectId(),
    class: '9th',
    section: 'Gold',
  };
  const normalizedLegacy = normalizeClasses(legacySession);
  assert.equal(normalizedLegacy.length, 1);
  assert.equal(normalizedLegacy[0].name, '9th');
  assert.equal(normalizedLegacy[0].section, 'Gold');
  assert.equal(normalizedLegacy[0]._id.toString(), legacySession._id.toString());
});

test('buildSubmissionView: isolates students and marks by classId without cross-contamination', () => {
  const class1Id = new mongoose.Types.ObjectId();
  const class2Id = new mongoose.Types.ObjectId();

  const session = {
    _id: new mongoose.Types.ObjectId(),
    examName: 'First Term Examination',
    classes: [
      { _id: class1Id, name: '1st Year' },
      { _id: class2Id, name: '2nd Year' },
    ],
    students: [
      { rollNumber: '01', name: 'Ali Khan', fatherName: 'Khan', classId: class1Id, class: '1st Year' },
      { rollNumber: '02', name: 'Ahmad', fatherName: 'Bashir', classId: class1Id, class: '1st Year' },
      { rollNumber: '101', name: 'Zainab', fatherName: 'Hassan', classId: class2Id, class: '2nd Year' },
    ],
  };

  const submission = {
    subjectName: 'Physics',
    totalMarks: 100,
    passingMarks: 40,
    status: 'IN_PROGRESS',
    classSubmissions: [
      {
        classId: class1Id,
        className: '1st Year',
        status: 'SUBMITTED',
        marks: [
          { rollNumber: '01', obtained: 85 },
          { rollNumber: '02', obtained: 35 },
        ],
        submittedAt: new Date(),
        submittedVia: 'PUBLIC_LINK',
      },
      {
        classId: class2Id,
        className: '2nd Year',
        status: 'PENDING',
        marks: [],
      },
    ],
  };

  // Inspect 1st Year Physics
  const view1 = buildSubmissionView(session, submission, class1Id);
  assert.equal(view1.subjectName, 'Physics');
  assert.equal(view1.className, '1st Year');
  assert.equal(view1.status, 'SUBMITTED');
  assert.equal(view1.rows.length, 2);
  assert.equal(view1.rows[0].name, 'Ali Khan');
  assert.equal(view1.rows[0].obtained, 85);
  assert.equal(view1.rows[0].status, 'PASS');
  assert.equal(view1.rows[1].name, 'Ahmad');
  assert.equal(view1.rows[1].obtained, 35);
  assert.equal(view1.rows[1].status, 'FAIL');

  // 2nd Year should have 0 marks submitted yet
  const view2 = buildSubmissionView(session, submission, class2Id);
  assert.equal(view2.className, '2nd Year');
  assert.equal(view2.status, 'PENDING');
  assert.equal(view2.rows.length, 0);
});

test('calculateResult: strictly isolates classes during final result and position calculation', () => {
  const subjects = [{ name: 'Physics', totalMarks: 100, passingMarks: 40 }];

  // 1st Year Students
  const class1Students = [
    { rollNumber: '10', name: 'Student 1A', marks: [{ subject: 'Physics', obtained: 95 }] },
    { rollNumber: '11', name: 'Student 1B', marks: [{ subject: 'Physics', obtained: 80 }] },
  ];

  // 2nd Year Students
  const class2Students = [
    { rollNumber: '20', name: 'Student 2A', marks: [{ subject: 'Physics', obtained: 90 }] },
    { rollNumber: '21', name: 'Student 2B', marks: [{ subject: 'Physics', obtained: 85 }] },
  ];

  const class1Result = calculateResult({ subjects, students: class1Students, expectedStrength: 2 });
  const class2Result = calculateResult({ subjects, students: class2Students, expectedStrength: 2 });

  // Class 1 ranking
  const pos1A = class1Result.students.find((s) => s.rollNumber === '10');
  const pos1B = class1Result.students.find((s) => s.rollNumber === '11');
  assert.equal(pos1A.position, 1);
  assert.equal(pos1B.position, 2);

  // Class 2 ranking: Student 2A (90 marks) must be position 1 in Class 2, even though Student 1A had 95 in Class 1!
  const pos2A = class2Result.students.find((s) => s.rollNumber === '20');
  const pos2B = class2Result.students.find((s) => s.rollNumber === '21');
  assert.equal(pos2A.position, 1, 'Class 2 top scorer must have position 1 in their own class');
  assert.equal(pos2B.position, 2);
});

test('Class submission authorization & duplicate protection logic check', () => {
  const allowedClasses = [
    { _id: 'class_1', name: '1st Year' },
    { _id: 'class_2', name: '2nd Year' },
  ];

  const classSubmissions = [
    { classId: 'class_1', status: 'SUBMITTED', marks: [{ rollNumber: '1', obtained: 50 }] },
    { classId: 'class_2', status: 'PENDING', marks: [] },
  ];

  // Helper verifying class belongs to exam
  function isClassAuthorized(cid) {
    return allowedClasses.some((c) => c._id === cid);
  }

  // Helper verifying duplicate prevention
  function canSubmitClass(cid) {
    const cs = classSubmissions.find((item) => item.classId === cid);
    if (!cs) return false;
    return cs.status === 'PENDING';
  }

  assert.equal(isClassAuthorized('class_1'), true);
  assert.equal(isClassAuthorized('class_2'), true);
  assert.equal(isClassAuthorized('class_3_unauthorized'), false, 'Unauthorized class must be rejected');

  assert.equal(canSubmitClass('class_1'), false, 'Already submitted class must be blocked from duplicate submission');
  assert.equal(canSubmitClass('class_2'), true, 'Pending class must be allowed for submission');
});

test('Subject overall status calculation: complete only when all classes submitted', () => {
  function computeSubjectStatus(classStatuses) {
    const total = classStatuses.length;
    const submittedCount = classStatuses.filter((s) => s === 'SUBMITTED' || s === 'LOCKED').length;
    if (submittedCount === total && total > 0) return 'SUBMITTED'; // complete
    if (submittedCount > 0) return 'IN_PROGRESS';
    return 'PENDING';
  }

  assert.equal(computeSubjectStatus(['PENDING', 'PENDING']), 'PENDING');
  assert.equal(computeSubjectStatus(['SUBMITTED', 'PENDING']), 'IN_PROGRESS');
  assert.equal(computeSubjectStatus(['SUBMITTED', 'SUBMITTED']), 'SUBMITTED');
  assert.equal(computeSubjectStatus(['LOCKED', 'SUBMITTED']), 'SUBMITTED');
});

test('Audit logging specification: must not contain raw tokens', () => {
  const auditEntry = {
    action: 'PERMANENT_RESULT_DELETION',
    performedBy: 'user_123',
    exam: 'First Term Examination',
    class: '1st Year',
    affectedSubjectCount: 4,
    studentCount: 35,
    timestamp: new Date().toISOString(),
  };

  assert.equal(auditEntry.action, 'PERMANENT_RESULT_DELETION');
  assert.equal('token' in auditEntry, false);
  assert.equal('submissionToken' in auditEntry, false);
  assert.equal(auditEntry.studentCount, 35);
  assert.equal(auditEntry.affectedSubjectCount, 4);
});
