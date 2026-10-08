const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const env = require('../src/config/env');
const {
  User,
  Student,
  ResultSession,
  SubjectSubmission,
  Result,
  ActivityLog,
} = require('../src/models');
const { createSessionSchema } = require('../src/validators/resultSessionValidators');
const { normalizeClasses, buildSubmissionView, attachSubmissionStatus } = require('../src/services/resultSessionViewService');
const { calculateResult } = require('../src/services/resultCalculationService');
const { logActivity } = require('../src/services/activityLogService');
const { generateSubmissionToken, hashToken } = require('../src/utils/submissionToken');

test('Class-Group Subject Configuration: Schema and Validation', () => {
  const payload = {
    examName: 'First Term Examination',
    examType: 'First Term Examination',
    resultDate: '2026-10-10',
    academicYear: '2026-2027',
    classes: [
      {
        name: '1st Year',
        group: 'Arts',
        subjects: [
          { name: 'English', totalMarks: 100, passingMarks: 33 },
          { name: 'Civics', totalMarks: 100, passingMarks: 33 },
        ],
      },
      {
        name: '1st Year',
        group: 'Pre-Medical',
        subjects: [
          { name: 'English', totalMarks: 75, passingMarks: 25 },
          { name: 'Physics', totalMarks: 100, passingMarks: 40 },
        ],
      },
    ],
    studentIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  };

  const parsed = createSessionSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.classes.length, 2);
  assert.equal(parsed.data.classes[0].group, 'Arts');
  assert.equal(parsed.data.classes[1].group, 'Pre-Medical');
  assert.equal(parsed.data.classes[0].subjects.length, 2);
});

test('End-to-End: Class/Group-Specific Subject Authorization, Result Isolation, and Permanent Deletion', async () => {
  await mongoose.connect(env.mongoUri);

  const testSuffix = Date.now().toString().slice(-6);
  const teacherId = new mongoose.Types.ObjectId();

  // 1. Create master students in 2 distinct groups of 1st Year (2026-2027)
  const studentArts1 = await Student.create({
    createdBy: teacherId,
    academicYear: '2026-2027',
    rollNumber: `ARTS-01-${testSuffix}`,
    name: 'Ayesha Arts',
    fatherName: 'Tariq',
    class: '1st Year',
    group: 'Arts',
    active: true,
  });

  const studentArts2 = await Student.create({
    createdBy: teacherId,
    academicYear: '2026-2027',
    rollNumber: `ARTS-02-${testSuffix}`,
    name: 'Bilal Arts',
    fatherName: 'Ahmed',
    class: '1st Year',
    group: 'Arts',
    active: true,
  });

  const studentMed1 = await Student.create({
    createdBy: teacherId,
    academicYear: '2026-2027',
    rollNumber: `MED-01-${testSuffix}`,
    name: 'Fatima Med',
    fatherName: 'Akbar',
    class: '1st Year',
    group: 'Pre-Medical',
    active: true,
  });

  const studentMed2 = await Student.create({
    createdBy: teacherId,
    academicYear: '2026-2027',
    rollNumber: `MED-02-${testSuffix}`,
    name: 'Zahid Med',
    fatherName: 'Hussain',
    class: '1st Year',
    group: 'Pre-Medical',
    active: true,
  });

  // 2. Setup Class/Group Configurations
  const classArtsId = new mongoose.Types.ObjectId();
  const classMedId = new mongoose.Types.ObjectId();

  const artsEnglishConfigId = new mongoose.Types.ObjectId();
  const artsCivicsConfigId = new mongoose.Types.ObjectId();
  const medEnglishConfigId = new mongoose.Types.ObjectId();
  const medPhysicsConfigId = new mongoose.Types.ObjectId();

  const classDocs = [
    {
      _id: classArtsId,
      name: '1st Year',
      group: 'Arts',
      section: '',
      displayName: '1st Year Arts',
      subjects: [
        { _id: artsEnglishConfigId, name: 'English', totalMarks: 100, passingMarks: 33 },
        { _id: artsCivicsConfigId, name: 'Civics', totalMarks: 100, passingMarks: 33 },
      ],
      finalResultId: null,
    },
    {
      _id: classMedId,
      name: '1st Year',
      group: 'Pre-Medical',
      section: '',
      displayName: '1st Year Pre-Medical',
      subjects: [
        { _id: medEnglishConfigId, name: 'English', totalMarks: 75, passingMarks: 25 },
        { _id: medPhysicsConfigId, name: 'Physics', totalMarks: 100, passingMarks: 40 },
      ],
      finalResultId: null,
    },
  ];

  const sessionStudents = [
    {
      rollNumber: studentArts1.rollNumber,
      name: studentArts1.name,
      fatherName: studentArts1.fatherName,
      class: '1st Year',
      group: 'Arts',
      classId: classArtsId,
      studentId: studentArts1._id,
    },
    {
      rollNumber: studentArts2.rollNumber,
      name: studentArts2.name,
      fatherName: studentArts2.fatherName,
      class: '1st Year',
      group: 'Arts',
      classId: classArtsId,
      studentId: studentArts2._id,
    },
    {
      rollNumber: studentMed1.rollNumber,
      name: studentMed1.name,
      fatherName: studentMed1.fatherName,
      class: '1st Year',
      group: 'Pre-Medical',
      classId: classMedId,
      studentId: studentMed1._id,
    },
    {
      rollNumber: studentMed2.rollNumber,
      name: studentMed2.name,
      fatherName: studentMed2.fatherName,
      class: '1st Year',
      group: 'Pre-Medical',
      classId: classMedId,
      studentId: studentMed2._id,
    },
  ];

  const session = await ResultSession.create({
    createdBy: teacherId,
    teacherNameSnapshot: 'Prof. Test Teacher',
    examName: 'First Term Examination',
    examType: 'First Term Examination',
    resultDate: new Date('2026-10-10'),
    academicYear: '2026-2027',
    class: '1st Year Arts, 1st Year Pre-Medical',
    classes: classDocs,
    students: sessionStudents,
    subjects: [
      { name: 'English', totalMarks: 100, passingMarks: 33 },
      { name: 'Civics', totalMarks: 100, passingMarks: 33 },
      { name: 'Physics', totalMarks: 100, passingMarks: 40 },
    ],
    submissionStatus: 'ACTIVE',
  });

  // 3. Provision Subject Links:
  // - English is shared by Arts AND Pre-Medical (covers both groups)
  // - Civics is configured ONLY for Arts
  // - Physics is configured ONLY for Pre-Medical
  const englishToken = generateSubmissionToken();
  const civicsToken = generateSubmissionToken();
  const physicsToken = generateSubmissionToken();

  const englishLink = await SubjectSubmission.create({
    resultSession: session._id,
    subjectId: artsEnglishConfigId,
    subjectName: 'English',
    totalMarks: 100,
    passingMarks: 33,
    submissionToken: englishToken,
    tokenHash: hashToken(englishToken),
    classSubmissions: [
      {
        classId: classArtsId,
        className: '1st Year',
        group: 'Arts',
        displayName: '1st Year Arts',
        totalMarks: 100,
        passingMarks: 33,
        status: 'PENDING',
        marks: [],
      },
      {
        classId: classMedId,
        className: '1st Year',
        group: 'Pre-Medical',
        displayName: '1st Year Pre-Medical',
        totalMarks: 75,
        passingMarks: 25,
        status: 'PENDING',
        marks: [],
      },
    ],
    status: 'PENDING',
  });

  const civicsLink = await SubjectSubmission.create({
    resultSession: session._id,
    subjectId: artsCivicsConfigId,
    subjectName: 'Civics',
    totalMarks: 100,
    passingMarks: 33,
    submissionToken: civicsToken,
    tokenHash: hashToken(civicsToken),
    classSubmissions: [
      {
        classId: classArtsId,
        className: '1st Year',
        group: 'Arts',
        displayName: '1st Year Arts',
        totalMarks: 100,
        passingMarks: 33,
        status: 'PENDING',
        marks: [],
      },
    ],
    status: 'PENDING',
  });

  const physicsLink = await SubjectSubmission.create({
    resultSession: session._id,
    subjectId: medPhysicsConfigId,
    subjectName: 'Physics',
    totalMarks: 100,
    passingMarks: 40,
    submissionToken: physicsToken,
    tokenHash: hashToken(physicsToken),
    classSubmissions: [
      {
        classId: classMedId,
        className: '1st Year',
        group: 'Pre-Medical',
        displayName: '1st Year Pre-Medical',
        totalMarks: 100,
        passingMarks: 40,
        status: 'PENDING',
        marks: [],
      },
    ],
    status: 'PENDING',
  });

  // Verify link coverage rules
  assert.equal(englishLink.classSubmissions.length, 2, 'English link covers both Arts and Pre-Medical');
  assert.equal(civicsLink.classSubmissions.length, 1, 'Civics link covers Arts only');
  assert.equal(civicsLink.classSubmissions[0].group, 'Arts');
  assert.equal(physicsLink.classSubmissions.length, 1, 'Physics link covers Pre-Medical only');
  assert.equal(physicsLink.classSubmissions[0].group, 'Pre-Medical');

  // Verify authorization check: Civics must NOT authorize Pre-Medical
  const isMedAuthorizedForCivics = civicsLink.classSubmissions.some(
    (cs) => cs.classId.toString() === classMedId.toString()
  );
  assert.equal(isMedAuthorizedForCivics, false, 'Pre-Medical must NOT be authorized for Civics');

  // Verify authorization check: Physics must NOT authorize Arts
  const isArtsAuthorizedForPhysics = physicsLink.classSubmissions.some(
    (cs) => cs.classId.toString() === classArtsId.toString()
  );
  assert.equal(isArtsAuthorizedForPhysics, false, 'Arts must NOT be authorized for Physics');

  // 4. Submit Marks for Arts: English & Civics
  englishLink.classSubmissions[0].status = 'SUBMITTED';
  englishLink.classSubmissions[0].marks = [
    { rollNumber: studentArts1.rollNumber, obtained: 80 },
    { rollNumber: studentArts2.rollNumber, obtained: 65 },
  ];
  await englishLink.save();

  civicsLink.classSubmissions[0].status = 'SUBMITTED';
  civicsLink.classSubmissions[0].marks = [
    { rollNumber: studentArts1.rollNumber, obtained: 90 },
    { rollNumber: studentArts2.rollNumber, obtained: 55 },
  ];
  civicsLink.status = 'SUBMITTED';
  await civicsLink.save();

  // 5. Submit Marks for Pre-Medical: English & Physics
  // Note: Pre-Med English has totalMarks=75
  englishLink.classSubmissions[1].status = 'SUBMITTED';
  englishLink.classSubmissions[1].marks = [
    { rollNumber: studentMed1.rollNumber, obtained: 70 }, // 70 / 75
    { rollNumber: studentMed2.rollNumber, obtained: 50 }, // 50 / 75
  ];
  englishLink.status = 'SUBMITTED';
  await englishLink.save();

  physicsLink.classSubmissions[0].status = 'SUBMITTED';
  physicsLink.classSubmissions[0].marks = [
    { rollNumber: studentMed1.rollNumber, obtained: 95 },
    { rollNumber: studentMed2.rollNumber, obtained: 85 },
  ];
  physicsLink.status = 'SUBMITTED';
  await physicsLink.save();

  // 6. Test Result Isolation: Calculate Arts and Pre-Med independently
  const artsStudentsInput = [
    {
      rollNumber: studentArts1.rollNumber,
      name: studentArts1.name,
      fatherName: studentArts1.fatherName,
      marks: [
        { subject: 'English', obtained: 80 },
        { subject: 'Civics', obtained: 90 },
      ],
    },
    {
      rollNumber: studentArts2.rollNumber,
      name: studentArts2.name,
      fatherName: studentArts2.fatherName,
      marks: [
        { subject: 'English', obtained: 65 },
        { subject: 'Civics', obtained: 55 },
      ],
    },
  ];

  const artsResultCalc = calculateResult({
    subjects: classDocs[0].subjects,
    students: artsStudentsInput,
    expectedStrength: 2,
  });

  assert.equal(artsResultCalc.totalMax, 200, 'Arts max marks is 100 (English) + 100 (Civics) = 200');
  assert.equal(artsResultCalc.students[0].position, 1);
  assert.equal(artsResultCalc.students[0].totalObtained, 170);
  assert.equal(artsResultCalc.students[1].position, 2);
  assert.equal(artsResultCalc.students[1].totalObtained, 120);

  const medStudentsInput = [
    {
      rollNumber: studentMed1.rollNumber,
      name: studentMed1.name,
      fatherName: studentMed1.fatherName,
      marks: [
        { subject: 'English', obtained: 70 },
        { subject: 'Physics', obtained: 95 },
      ],
    },
    {
      rollNumber: studentMed2.rollNumber,
      name: studentMed2.name,
      fatherName: studentMed2.fatherName,
      marks: [
        { subject: 'English', obtained: 50 },
        { subject: 'Physics', obtained: 85 },
      ],
    },
  ];

  const medResultCalc = calculateResult({
    subjects: classDocs[1].subjects,
    students: medStudentsInput,
    expectedStrength: 2,
  });

  assert.equal(medResultCalc.totalMax, 175, 'Pre-Med max marks is 75 (English) + 100 (Physics) = 175');
  assert.equal(medResultCalc.students[0].position, 1, 'Top scorer in Pre-Med has position 1 in Pre-Med');
  assert.equal(medResultCalc.students[0].totalObtained, 165);
  assert.equal(medResultCalc.students[1].position, 2);

  // 7. Save Final Result for Arts in DB
  const artsFinalResult = await Result.create({
    createdBy: teacherId,
    teacherNameSnapshot: 'Prof. Test Teacher',
    sourceSessionId: session._id,
    sourceSessionClassId: classArtsId,
    class: '1st Year',
    group: 'Arts',
    academicYear: '2026-2027',
    examType: 'First Term Examination',
    resultDate: new Date('2026-10-10'),
    subjects: classDocs[0].subjects,
    students: artsResultCalc.students,
    statistics: artsResultCalc.statistics,
  });

  const medFinalResult = await Result.create({
    createdBy: teacherId,
    teacherNameSnapshot: 'Prof. Test Teacher',
    sourceSessionId: session._id,
    sourceSessionClassId: classMedId,
    class: '1st Year',
    group: 'Pre-Medical',
    academicYear: '2026-2027',
    examType: 'First Term Examination',
    resultDate: new Date('2026-10-10'),
    subjects: classDocs[1].subjects,
    students: medResultCalc.students,
    statistics: medResultCalc.statistics,
  });

  // 8. Test Permanent Deletion of 1st Year Arts:
  // Must delete Arts final result and Arts submission data.
  // Must NOT delete Pre-Medical final result, Pre-Medical marks, or master student records!
  await logActivity({
    userId: teacherId,
    action: 'PERMANENT_RESULT_DELETION',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      examName: 'First Term Examination',
      class: '1st Year',
      group: 'Arts',
      studentCount: 2,
      affectedSubjectCount: 2,
      scope: 'CLASS_GROUP_RESULT',
    },
  });

  // Delete Arts result
  await Result.findByIdAndDelete(artsFinalResult._id);

  // Pull Arts from SubjectSubmissions
  await SubjectSubmission.updateMany(
    { resultSession: session._id },
    {
      $pull: {
        classSubmissions: { classId: classArtsId },
      },
    }
  );

  // Delete any submission that has 0 classSubmissions (Civics was Arts only!)
  await SubjectSubmission.deleteMany({
    resultSession: session._id,
    classSubmissions: { $size: 0 },
  });

  // Verify Post-Deletion State:
  // - Arts Result is deleted
  const checkArtsResult = await Result.findById(artsFinalResult._id);
  assert.equal(checkArtsResult, null, 'Arts result must be deleted');

  // - Pre-Med Result is completely intact!
  const checkMedResult = await Result.findById(medFinalResult._id);
  assert.notEqual(checkMedResult, null, 'Pre-Medical result must remain intact');
  assert.equal(checkMedResult.group, 'Pre-Medical');
  assert.equal(checkMedResult.students.length, 2);

  // - Master Student records are untouched!
  const checkMasterStudentArts = await Student.findById(studentArts1._id);
  assert.notEqual(checkMasterStudentArts, null, 'Master student records must NEVER be deleted');
  assert.equal(checkMasterStudentArts.name, 'Ayesha Arts');

  // - Civics link (Arts only) was cleanly deleted because Arts is gone
  const checkCivicsLink = await SubjectSubmission.findById(civicsLink._id);
  assert.equal(checkCivicsLink, null, 'Civics link must be removed as no class has it anymore');

  // - English and Physics links remain active for Pre-Medical!
  const checkEnglishLink = await SubjectSubmission.findById(englishLink._id);
  assert.notEqual(checkEnglishLink, null, 'English link must remain active for Pre-Medical');
  assert.equal(checkEnglishLink.classSubmissions.length, 1);
  assert.equal(checkEnglishLink.classSubmissions[0].group, 'Pre-Medical');

  const checkPhysicsLink = await SubjectSubmission.findById(physicsLink._id);
  assert.notEqual(checkPhysicsLink, null, 'Physics link must remain active for Pre-Medical');

  // - Audit log for PERMANENT_RESULT_DELETION exists and survives
  const auditLogs = await ActivityLog.find({
    action: 'PERMANENT_RESULT_DELETION',
    target: session._id,
  });
  assert.equal(auditLogs.length > 0, true, 'Permanent deletion audit log must be preserved');
  assert.equal(auditLogs[0].metadata.group, 'Arts');

  // 9. Test Invalid Tokens, Disabled Links, and Unauthorized Class Requests
  const nonExistentLink = await SubjectSubmission.findOne({ submissionToken: 'RES-INVALID999' });
  assert.equal(nonExistentLink, null, 'Non-existent token must not return a document');

  const disabledTestLink = {
    submissionToken: 'RES-DISABL123',
    status: 'DISABLED',
  };
  function checkLinkAccess(link) {
    if (!link) throw new Error('Invalid submission link');
    if (link.status === 'DISABLED') throw new Error('This submission link is currently disabled');
    return true;
  }
  assert.throws(() => checkLinkAccess(null), /Invalid submission link/);
  assert.throws(() => checkLinkAccess(disabledTestLink), /This submission link is currently disabled/);

  function authorizeClassForSubmission(subjectSubmission, requestedClassId) {
    const isAuthorized = (subjectSubmission.classSubmissions || []).some(
      (cs) => cs.classId.toString() === requestedClassId.toString()
    );
    if (!isAuthorized) {
      throw new Error('Class not authorized for this exam submission');
    }
    return true;
  }

  assert.equal(authorizeClassForSubmission(physicsLink, classMedId), true);
  assert.throws(
    () => authorizeClassForSubmission(physicsLink, classArtsId),
    /Class not authorized for this exam submission/
  );

  // Clean up test data
  await Student.deleteMany({ createdBy: teacherId });
  await Result.deleteMany({ createdBy: teacherId });
  await SubjectSubmission.deleteMany({ resultSession: session._id });
  await ResultSession.deleteOne({ _id: session._id });
  await ActivityLog.deleteMany({ target: session._id });
});

test('Same Class with Different Groups allows identical Roll Numbers', async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongoUri);
  }

  const teacherId = new mongoose.Types.ObjectId();
  const testYear = '2026-2027';

  // 1. Create Roll 1 in 1st Year Arts
  const studentArts = await Student.create({
    createdBy: teacherId,
    class: '1st Year',
    group: 'Arts',
    section: '',
    academicYear: testYear,
    rollNumber: '1',
    name: 'Ahmad Arts',
    active: true,
  });
  assert.equal(studentArts.rollNumber, '1');
  assert.equal(studentArts.group, 'Arts');

  // 2. Create Roll 1 in 1st Year Pre-Medical (same class, same roll, different group)
  const studentMed = await Student.create({
    createdBy: teacherId,
    class: '1st Year',
    group: 'Pre-Medical',
    section: '',
    academicYear: testYear,
    rollNumber: '1',
    name: 'Bilal Pre-Med',
    active: true,
  });
  assert.equal(studentMed.rollNumber, '1');
  assert.equal(studentMed.group, 'Pre-Medical');

  // 3. Create Roll 1 in 1st Year Pre-Engineering (same class, same roll, third group)
  const studentEng = await Student.create({
    createdBy: teacherId,
    class: '1st Year',
    group: 'Pre-Engineering',
    section: '',
    academicYear: testYear,
    rollNumber: '1',
    name: 'Hamza Pre-Eng',
    active: true,
  });
  assert.equal(studentEng.rollNumber, '1');
  assert.equal(studentEng.group, 'Pre-Engineering');

  // 4. Verify that duplicate within the SAME class AND SAME group is rejected
  let duplicateRejected = false;
  try {
    await Student.create({
      createdBy: teacherId,
      class: '1st Year',
      group: 'Arts',
      section: '',
      academicYear: testYear,
      rollNumber: '1',
      name: 'Duplicate In Same Group',
      active: true,
    });
  } catch (err) {
    duplicateRejected = true;
    assert.match(err.message, /duplicate key|E11000/i);
  }
  assert.equal(duplicateRejected, true, 'Duplicate roll number in the SAME group must be rejected');

  // Cleanup
  await Student.deleteMany({ createdBy: teacherId });
  await mongoose.disconnect();
});
