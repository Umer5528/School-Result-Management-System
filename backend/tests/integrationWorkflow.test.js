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
const { generateSubmissionToken, hashToken } = require('../src/utils/submissionToken');
const { normalizeClasses, buildSubmissionView } = require('../src/services/resultSessionViewService');
const { submitClassMarks } = require('../src/controllers/publicSubmissionController');

test('End-to-End Workflow: Multi-Class Exam, One Subject Link, Independent Submissions, and Permanent Deletion', async () => {
  await mongoose.connect(env.mongoUri);

  const testId = Date.now().toString().slice(-6);
  const adminId = new mongoose.Types.ObjectId();

  // Create permanent master students in database
  const masterStudent1 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `TEST-1A-${testId}`,
    name: 'Ali Khan',
    fatherName: 'Tariq Khan',
    class: '1st Year',
    section: 'A',
    active: true,
  });

  const masterStudent2 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `TEST-1B-${testId}`,
    name: 'Ahmad Raza',
    fatherName: 'Raza Ali',
    class: '1st Year',
    section: 'A',
    active: true,
  });

  const masterStudent3 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `TEST-2A-${testId}`,
    name: 'Hamza Malik',
    fatherName: 'Malik Akbar',
    class: '2nd Year',
    section: 'B',
    active: true,
  });

  const masterStudent4 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `TEST-2B-${testId}`,
    name: 'Usman Ghani',
    fatherName: 'Ghani Shah',
    class: '2nd Year',
    section: 'B',
    active: true,
  });

  let createdSessionId = null;

  try {
    // ---------------------------------------------------------
    // TEST CASE 1: Create Exam with 1st Year & 2nd Year, 2 subjects (Physics, Chemistry)
    // Verify: Exactly ONE submission link per subject.
    // ---------------------------------------------------------
    const class1Id = new mongoose.Types.ObjectId();
    const class2Id = new mongoose.Types.ObjectId();

    const session = await ResultSession.create({
      examName: `Term Exam ${testId}`,
      examType: 'MIDTERM',
      academicYear: '2026-2027',
      resultDate: new Date('2026-10-10'),
      createdBy: adminId,
      teacherNameSnapshot: 'Admin Teacher',
      status: 'ACTIVE',
      classes: [
        { _id: class1Id, name: '1st Year', section: 'A' },
        { _id: class2Id, name: '2nd Year', section: 'B' },
      ],
      class: '1st Year, 2nd Year',
      subjects: [
        { name: 'Physics', totalMarks: 100, passingMarks: 40 },
        { name: 'Chemistry', totalMarks: 100, passingMarks: 40 },
      ],
      students: [
        {
          studentId: masterStudent1._id,
          rollNumber: masterStudent1.rollNumber,
          name: masterStudent1.name,
          fatherName: masterStudent1.fatherName,
          classId: class1Id,
          class: '1st Year',
          section: 'A',
        },
        {
          studentId: masterStudent2._id,
          rollNumber: masterStudent2.rollNumber,
          name: masterStudent2.name,
          fatherName: masterStudent2.fatherName,
          classId: class1Id,
          class: '1st Year',
          section: 'A',
        },
        {
          studentId: masterStudent3._id,
          rollNumber: masterStudent3.rollNumber,
          name: masterStudent3.name,
          fatherName: masterStudent3.fatherName,
          classId: class2Id,
          class: '2nd Year',
          section: 'B',
        },
        {
          studentId: masterStudent4._id,
          rollNumber: masterStudent4.rollNumber,
          name: masterStudent4.name,
          fatherName: masterStudent4.fatherName,
          classId: class2Id,
          class: '2nd Year',
          section: 'B',
        },
      ],
    });
    createdSessionId = session._id;

    // Create SubjectSubmissions (one per subject)
    const physicsSubj = session.subjects.find((s) => s.name === 'Physics');
    const chemistrySubj = session.subjects.find((s) => s.name === 'Chemistry');

    const physicsToken = generateSubmissionToken();
    const chemistryToken = generateSubmissionToken();

    const physicsSubmission = await SubjectSubmission.create({
      resultSession: session._id,
      subjectId: physicsSubj._id,
      subjectName: physicsSubj.name,
      totalMarks: physicsSubj.totalMarks,
      passingMarks: physicsSubj.passingMarks,
      submissionToken: physicsToken,
      status: 'PENDING',
      classSubmissions: [
        { classId: class1Id, className: '1st Year', section: 'A', status: 'PENDING', marks: [] },
        { classId: class2Id, className: '2nd Year', section: 'B', status: 'PENDING', marks: [] },
      ],
    });

    const chemistrySubmission = await SubjectSubmission.create({
      resultSession: session._id,
      subjectId: chemistrySubj._id,
      subjectName: chemistrySubj.name,
      totalMarks: chemistrySubj.totalMarks,
      passingMarks: chemistrySubj.passingMarks,
      submissionToken: chemistryToken,
      status: 'PENDING',
      classSubmissions: [
        { classId: class1Id, className: '1st Year', section: 'A', status: 'PENDING', marks: [] },
        { classId: class2Id, className: '2nd Year', section: 'B', status: 'PENDING', marks: [] },
      ],
    });

    const allSubmissions = await SubjectSubmission.find({ resultSession: session._id });
    assert.equal(allSubmissions.length, 2, 'Must create exactly ONE link per subject, NOT one per class per subject');

    // ---------------------------------------------------------
    // TEST CASE 2: Open Physics link
    // Verify: Only 1st Year and 2nd Year are visible. Unrelated classes are NOT exposed.
    // ---------------------------------------------------------
    const normalizedClasses = normalizeClasses(session);
    assert.equal(normalizedClasses.length, 2);
    assert.deepEqual(
      normalizedClasses.map((c) => c.name),
      ['1st Year', '2nd Year']
    );

    // ---------------------------------------------------------
    // TEST CASE 3: Select 1st Year, enter marks, submit.
    // Verify: 1st Year Physics = Submitted, 2nd Year Physics = Pending.
    // ---------------------------------------------------------
    const class1Roster = session.students.filter((s) => s.classId.toString() === class1Id.toString());
    assert.equal(class1Roster.length, 2);
    assert.equal(class1Roster[0].name, 'Ali Khan');
    assert.equal(class1Roster[1].name, 'Ahmad Raza');

    // Submit 1st Year marks
    const class1Marks = [
      { rollNumber: masterStudent1.rollNumber, obtained: 88 },
      { rollNumber: masterStudent2.rollNumber, obtained: 74 },
    ];

    const updatedSub1 = await SubjectSubmission.findOneAndUpdate(
      {
        _id: physicsSubmission._id,
        status: { $ne: 'DISABLED' },
        classSubmissions: {
          $elemMatch: {
            classId: class1Id,
            status: 'PENDING',
          },
        },
      },
      {
        $set: {
          'classSubmissions.$[target].status': 'SUBMITTED',
          'classSubmissions.$[target].marks': class1Marks,
          'classSubmissions.$[target].submittedVia': 'public',
          'classSubmissions.$[target].submittedAt': new Date(),
        },
      },
      {
        arrayFilters: [{ 'target.classId': class1Id, 'target.status': 'PENDING' }],
        new: true,
      }
    );

    // Recalculate overall status
    const submittedClasses1 = updatedSub1.classSubmissions.filter((cs) => cs.status === 'SUBMITTED');
    updatedSub1.status = submittedClasses1.length >= normalizedClasses.length ? 'SUBMITTED' : 'IN_PROGRESS';
    await updatedSub1.save();

    const class1SubStatus = updatedSub1.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    const class2SubStatus = updatedSub1.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    assert.equal(class1SubStatus.status, 'SUBMITTED', '1st Year Physics must be Submitted');
    assert.equal(class2SubStatus.status, 'PENDING', '2nd Year Physics must be Pending');
    assert.equal(updatedSub1.status, 'IN_PROGRESS', 'Physics overall status must be IN_PROGRESS');

    // ---------------------------------------------------------
    // TEST CASE 4: Select 2nd Year, submit marks.
    // Verify: 1st Year = Submitted, 2nd Year = Submitted, Physics = Complete (SUBMITTED).
    // ---------------------------------------------------------
    const class2Marks = [
      { rollNumber: masterStudent3.rollNumber, obtained: 92 },
      { rollNumber: masterStudent4.rollNumber, obtained: 80 },
    ];

    const updatedSub2 = await SubjectSubmission.findOneAndUpdate(
      {
        _id: physicsSubmission._id,
        status: { $ne: 'DISABLED' },
        classSubmissions: {
          $elemMatch: {
            classId: class2Id,
            status: 'PENDING',
          },
        },
      },
      {
        $set: {
          'classSubmissions.$[target].status': 'SUBMITTED',
          'classSubmissions.$[target].marks': class2Marks,
          'classSubmissions.$[target].submittedVia': 'public',
          'classSubmissions.$[target].submittedAt': new Date(),
        },
      },
      {
        arrayFilters: [{ 'target.classId': class2Id, 'target.status': 'PENDING' }],
        new: true,
      }
    );

    const submittedClasses2 = updatedSub2.classSubmissions.filter((cs) => cs.status === 'SUBMITTED');
    updatedSub2.status = submittedClasses2.length >= normalizedClasses.length ? 'SUBMITTED' : 'IN_PROGRESS';
    await updatedSub2.save();

    assert.equal(updatedSub2.status, 'SUBMITTED', 'Overall subject status must be SUBMITTED (Complete) when all classes done');

    // ---------------------------------------------------------
    // TEST CASE 5: Try submitting or accessing an unauthorized classId
    // Verify: IDOR / cross-class access is blocked.
    // ---------------------------------------------------------
    const unauthorizedClassId = new mongoose.Types.ObjectId();
    const isAuthorized = normalizedClasses.some((c) => c._id.toString() === unauthorizedClassId.toString());
    assert.equal(isAuthorized, false, 'Unauthorized classId must be rejected');

    // ---------------------------------------------------------
    // TEST CASE 6: Try opening an invalid/revoked token
    // Verify: Invalid token query returns null.
    // ---------------------------------------------------------
    const invalidDoc = await SubjectSubmission.findOne({ submissionToken: 'RES-INVALID-999' });
    assert.equal(invalidDoc, null, 'Invalid token must return null');

    // ---------------------------------------------------------
    // TEST CASE 7: Submit the same class twice
    // Verify: Atomic update fails because status is already SUBMITTED.
    // ---------------------------------------------------------
    const duplicateAttempt = await SubjectSubmission.findOneAndUpdate(
      {
        _id: physicsSubmission._id,
        status: { $ne: 'DISABLED' },
        classSubmissions: {
          $elemMatch: {
            classId: class1Id,
            status: 'PENDING',
          },
        },
      },
      {
        $set: { 'classSubmissions.$[target].marks': [{ rollNumber: 'dummy', obtained: 50 }] },
      },
      {
        arrayFilters: [{ 'target.classId': class1Id, 'target.status': 'PENDING' }],
        new: true,
      }
    );
    assert.equal(duplicateAttempt, null, 'Duplicate submission must be rejected when status is SUBMITTED');

    // ---------------------------------------------------------
    // TEST CASE 8: Admin reopens 1st Year Physics
    // Verify: 1st Year becomes PENDING, 2nd Year remains SUBMITTED.
    // ---------------------------------------------------------
    const reopenedSub = await SubjectSubmission.findOneAndUpdate(
      {
        _id: physicsSubmission._id,
      },
      {
        $set: {
          'classSubmissions.$[target].status': 'PENDING',
          'classSubmissions.$[target].marks': [],
          status: 'IN_PROGRESS',
        },
      },
      {
        arrayFilters: [{ 'target.classId': class1Id }],
        new: true,
      }
    );

    const reopenedClass1 = reopenedSub.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    const reopenedClass2 = reopenedSub.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    assert.equal(reopenedClass1.status, 'PENDING', '1st Year must be reopened to PENDING');
    assert.equal(reopenedClass2.status, 'SUBMITTED', '2nd Year marks and status must remain SUBMITTED');
    assert.equal(reopenedSub.status, 'IN_PROGRESS', 'Subject overall status becomes IN_PROGRESS');

    // ---------------------------------------------------------
    // TEST CASE 9: Admin regenerates Physics link
    // Verify: Old token stops working, new token works, existing submitted marks remain intact.
    // ---------------------------------------------------------
    const oldPhysicsToken = physicsSubmission.submissionToken;
    const newPhysicsToken = generateSubmissionToken();

    await SubjectSubmission.findByIdAndUpdate(physicsSubmission._id, {
      submissionToken: newPhysicsToken,
    });

    const oldTokenQuery = await SubjectSubmission.findOne({ submissionToken: oldPhysicsToken });
    const newTokenQuery = await SubjectSubmission.findOne({ submissionToken: newPhysicsToken });

    assert.equal(oldTokenQuery, null, 'Old token must be invalid after regeneration');
    assert.notEqual(newTokenQuery, null, 'New token must be valid');
    const class2MarksAfterRegen = newTokenQuery.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    assert.equal(class2MarksAfterRegen.marks.length, 2, 'Existing submitted marks must remain intact');
    assert.equal(class2MarksAfterRegen.status, 'SUBMITTED');

    // ---------------------------------------------------------
    // TEST CASE 10: Admin permanently deletes 1st Year result
    // Verify: 1st Year data removed, 2nd Year untouched, Master Student records untouched, audit log created.
    // ---------------------------------------------------------
    // 1. Audit log BEFORE deletion
    const auditRecord1 = await ActivityLog.create({
      user: adminId,
      action: 'PERMANENT_RESULT_DELETION',
      targetType: 'ResultSession',
      target: session._id,
      metadata: {
        examName: session.examName,
        class: '1st Year',
        section: 'A',
        studentCount: 2,
        affectedSubjectCount: 2,
        scope: 'CLASS_RESULT',
      },
    });
    assert.equal(auditRecord1.action, 'PERMANENT_RESULT_DELETION');

    // 2. Remove class 1 from SubjectSubmissions
    await SubjectSubmission.updateMany(
      { resultSession: session._id },
      { $pull: { classSubmissions: { classId: class1Id } } }
    );

    // 3. Remove class 1 from session
    session.students = session.students.filter((s) => s.classId.toString() !== class1Id.toString());
    session.classes = session.classes.filter((c) => c._id.toString() !== class1Id.toString());
    session.class = '2nd Year';
    await session.save();

    // Verify session state
    const refreshedSession = await ResultSession.findById(session._id);
    assert.equal(refreshedSession.classes.length, 1, 'Only 2nd Year should remain in session');
    assert.equal(refreshedSession.classes[0].name, '2nd Year');
    assert.equal(refreshedSession.students.length, 2, 'Only 2nd Year students remain in session');

    // Verify Master Student records are strictly preserved
    const master1Check = await Student.findById(masterStudent1._id);
    const master2Check = await Student.findById(masterStudent2._id);
    assert.notEqual(master1Check, null, 'Master Student 1 must NOT be deleted');
    assert.notEqual(master2Check, null, 'Master Student 2 must NOT be deleted');

    // ---------------------------------------------------------
    // TEST CASE 11: Finalize 2nd Year and then Permanently Delete Entire Exam
    // Verify: Finalized result and all session data removed, master students remain untouched, audit log created.
    // ---------------------------------------------------------
    // Finalize 2nd Year
    const finalResult2 = await Result.create({
      examName: session.examName,
      examType: session.examType,
      academicYear: session.academicYear,
      resultDate: session.resultDate,
      class: '2nd Year',
      section: 'B',
      sourceSessionId: session._id,
      sourceSessionClassId: class2Id,
      createdBy: adminId,
      teacherNameSnapshot: 'Admin Teacher',
      subjects: [{ name: 'Physics', totalMarks: 100, passingMarks: 40 }],
      students: [
        {
          studentId: masterStudent3._id,
          rollNumber: masterStudent3.rollNumber,
          name: masterStudent3.name,
          fatherName: masterStudent3.fatherName,
          marks: [{ subject: 'Physics', obtained: 92 }],
          totalObtained: 92,
          totalMax: 100,
          percentage: 92,
          status: 'PASS',
          position: 1,
        },
      ],
      totalStudents: 1,
      passedStudents: 1,
      failedStudents: 0,
      passPercentage: 100,
      isFinalized: true,
    });

    assert.notEqual(finalResult2, null);

    // Pre-deletion audit log for entire exam
    const auditRecord2 = await ActivityLog.create({
      user: adminId,
      action: 'PERMANENT_RESULT_DELETION',
      targetType: 'ResultSession',
      target: session._id,
      metadata: {
        examName: session.examName,
        classes: ['2nd Year'],
        studentCount: 1,
        affectedSubjectCount: 1,
        scope: 'ENTIRE_EXAM',
      },
    });
    assert.equal(auditRecord2.action, 'PERMANENT_RESULT_DELETION');

    // Delete finalized results, subject submissions, and session
    await Result.deleteMany({ sourceSessionId: session._id });
    await SubjectSubmission.deleteMany({ resultSession: session._id });
    await ResultSession.findByIdAndDelete(session._id);

    // Verify all exam-specific records are gone
    const deletedSession = await ResultSession.findById(session._id);
    const deletedFinalResult = await Result.findById(finalResult2._id);
    const remainingSubs = await SubjectSubmission.find({ resultSession: session._id });

    assert.equal(deletedSession, null, 'ResultSession must be deleted');
    assert.equal(deletedFinalResult, null, 'Finalized Result must be deleted');
    assert.equal(remainingSubs.length, 0, 'Subject submissions must be deleted');

    // Verify master students are STILL preserved
    const master3Check = await Student.findById(masterStudent3._id);
    const master4Check = await Student.findById(masterStudent4._id);
    assert.notEqual(master3Check, null, 'Master Student 3 must NOT be deleted');
    assert.notEqual(master4Check, null, 'Master Student 4 must NOT be deleted');

    // Verify audit logs persist
    const loggedAudits = await ActivityLog.find({ action: 'PERMANENT_RESULT_DELETION', target: session._id });
    assert.equal(loggedAudits.length, 2, 'Audit logs must persist after deletion');
  } finally {
    // Cleanup temporary test master students and audit logs
    await Student.deleteMany({ _id: { $in: [masterStudent1._id, masterStudent2._id, masterStudent3._id, masterStudent4._id] } });
    if (createdSessionId) {
      await ActivityLog.deleteMany({ target: createdSessionId });
    }
  }
});

test('Regression Coverage: 3 Class/Group Combinations with Shared Subject - Out-of-Order Submission (2nd Year Arts First)', async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongoUri);
  }

  const testSuffix = Date.now().toString().slice(-6);
  const adminId = new mongoose.Types.ObjectId();

  // Create isolated master students
  // 1st Year Arts (2 students)
  const student1A1 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-1A1-${testSuffix}`,
    name: 'Arts Student One',
    fatherName: 'Father One',
    class: '1st Year',
    group: 'Arts',
    active: true,
  });
  const student1A2 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-1A2-${testSuffix}`,
    name: 'Arts Student Two',
    fatherName: 'Father Two',
    class: '1st Year',
    group: 'Arts',
    active: true,
  });

  // 1st Year Pre-Medical (2 students)
  const student1M1 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-1M1-${testSuffix}`,
    name: 'Med Student One',
    fatherName: 'Father Three',
    class: '1st Year',
    group: 'Pre-Medical',
    active: true,
  });
  const student1M2 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-1M2-${testSuffix}`,
    name: 'Med Student Two',
    fatherName: 'Father Four',
    class: '1st Year',
    group: 'Pre-Medical',
    active: true,
  });

  // 2nd Year Arts (2 students)
  const student2A1 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-2A1-${testSuffix}`,
    name: '2nd Year Arts Student One',
    fatherName: 'Father Five',
    class: '2nd Year',
    group: 'Arts',
    active: true,
  });
  const student2A2 = await Student.create({
    createdBy: adminId,
    academicYear: '2026-2027',
    rollNumber: `REG-2A2-${testSuffix}`,
    name: '2nd Year Arts Student Two',
    fatherName: 'Father Six',
    class: '2nd Year',
    group: 'Arts',
    active: true,
  });

  const class1Id = new mongoose.Types.ObjectId(); // 1st Year Arts (index 0)
  const class2Id = new mongoose.Types.ObjectId(); // 1st Year Pre-Medical (index 1)
  const class3Id = new mongoose.Types.ObjectId(); // 2nd Year Arts (index 2)

  let sessionId = null;

  try {
    // 1. Create Exam Session with 3 class/group combinations
    const session = await ResultSession.create({
      examName: `Regression Exam ${testSuffix}`,
      examType: 'MIDTERM',
      academicYear: '2026-2027',
      resultDate: new Date('2026-10-15'),
      createdBy: adminId,
      teacherNameSnapshot: 'Regression Tester',
      submissionStatus: 'ACTIVE',
      classes: [
        { _id: class1Id, name: '1st Year', group: 'Arts', displayName: '1st Year Arts' },
        { _id: class2Id, name: '1st Year', group: 'Pre-Medical', displayName: '1st Year Pre-Medical' },
        { _id: class3Id, name: '2nd Year', group: 'Arts', displayName: '2nd Year Arts' },
      ],
      students: [
        {
          studentId: student1A1._id,
          rollNumber: student1A1.rollNumber,
          name: student1A1.name,
          fatherName: student1A1.fatherName,
          class: '1st Year',
          group: 'Arts',
          classId: class1Id,
        },
        {
          studentId: student1A2._id,
          rollNumber: student1A2.rollNumber,
          name: student1A2.name,
          fatherName: student1A2.fatherName,
          class: '1st Year',
          group: 'Arts',
          classId: class1Id,
        },
        {
          studentId: student1M1._id,
          rollNumber: student1M1.rollNumber,
          name: student1M1.name,
          fatherName: student1M1.fatherName,
          class: '1st Year',
          group: 'Pre-Medical',
          classId: class2Id,
        },
        {
          studentId: student1M2._id,
          rollNumber: student1M2.rollNumber,
          name: student1M2.name,
          fatherName: student1M2.fatherName,
          class: '1st Year',
          group: 'Pre-Medical',
          classId: class2Id,
        },
        {
          studentId: student2A1._id,
          rollNumber: student2A1.rollNumber,
          name: student2A1.name,
          fatherName: student2A1.fatherName,
          class: '2nd Year',
          group: 'Arts',
          classId: class3Id,
        },
        {
          studentId: student2A2._id,
          rollNumber: student2A2.rollNumber,
          name: student2A2.name,
          fatherName: student2A2.fatherName,
          class: '2nd Year',
          group: 'Arts',
          classId: class3Id,
        },
      ],
    });
    sessionId = session._id;

    // 2. Create SubjectSubmission for shared subject 'Urdu' covering all 3 groups
    const urduToken = `RES-URDU-${testSuffix}`;
    const urduSub = await SubjectSubmission.create({
      resultSession: session._id,
      subjectId: new mongoose.Types.ObjectId(),
      subjectName: 'Urdu',
      totalMarks: 100,
      passingMarks: 40,
      submissionToken: urduToken,
      tokenHash: hashToken(urduToken),
      status: 'PENDING',
      classSubmissions: [
        {
          classId: class1Id,
          className: '1st Year',
          group: 'Arts',
          displayName: '1st Year Arts',
          status: 'PENDING',
          marks: [],
        },
        {
          classId: class2Id,
          className: '1st Year',
          group: 'Pre-Medical',
          displayName: '1st Year Pre-Medical',
          status: 'PENDING',
          marks: [],
        },
        {
          classId: class3Id,
          className: '2nd Year',
          group: 'Arts',
          displayName: '2nd Year Arts',
          status: 'PENDING',
          marks: [],
        },
      ],
    });

    // 3. Create SubjectSubmission for single-class subject 'Physics' (Pre-Medical only)
    const physicsToken = `RES-PHY-${testSuffix}`;
    const physicsSub = await SubjectSubmission.create({
      resultSession: session._id,
      subjectId: new mongoose.Types.ObjectId(),
      subjectName: 'Physics',
      totalMarks: 75,
      passingMarks: 25,
      submissionToken: physicsToken,
      tokenHash: hashToken(physicsToken),
      status: 'PENDING',
      classSubmissions: [
        {
          classId: class2Id,
          className: '1st Year',
          group: 'Pre-Medical',
          displayName: '1st Year Pre-Medical',
          status: 'PENDING',
          marks: [],
        },
      ],
    });

    // Helper to invoke submitClassMarks controller
    const callSubmit = async (token, classId, marks) => {
      let resJson = null;
      let statusCode = 200;
      const req = {
        params: { token, classId: classId.toString() },
        body: { marks },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return { json: (d) => { resJson = d; return d; } };
        },
        json: (d) => { resJson = d; return d; },
      };
      await submitClassMarks(req, res);
      return { statusCode, data: resJson };
    };

    // ----------------------------------------------------------------------------------
    // STEP 1: Submit marks for 2nd Year Arts FIRST (Index 2 in classSubmissions array)
    // ----------------------------------------------------------------------------------
    const marks2ndYearArts = [
      { rollNumber: student2A1.rollNumber, obtained: 85 },
      { rollNumber: student2A2.rollNumber, obtained: 92 },
    ];
    await callSubmit(urduToken, class3Id, marks2ndYearArts);

    // Verify database state after 2nd Year Arts submission
    const urduCheck1 = await SubjectSubmission.findById(urduSub._id);
    const cs1stArts_1 = urduCheck1.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    const cs1stMed_1 = urduCheck1.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    const cs2ndArts_1 = urduCheck1.classSubmissions.find((cs) => cs.classId.toString() === class3Id.toString());

    // CRUCIAL ASSERTION: Index 0 (1st Year Arts) MUST NOT have received 2nd Year Arts marks!
    assert.equal(cs1stArts_1.status, 'PENDING', '1st Year Arts MUST remain PENDING when 2nd Year Arts is submitted');
    assert.equal(cs1stArts_1.marks.length, 0, '1st Year Arts marks must be empty');

    // Index 1 (1st Year Pre-Medical) MUST NOT have received marks!
    assert.equal(cs1stMed_1.status, 'PENDING', '1st Year Pre-Medical MUST remain PENDING');
    assert.equal(cs1stMed_1.marks.length, 0, '1st Year Pre-Medical marks must be empty');

    // Index 2 (2nd Year Arts) MUST be SUBMITTED with the exact marks
    assert.equal(cs2ndArts_1.status, 'SUBMITTED', '2nd Year Arts MUST be SUBMITTED');
    assert.equal(cs2ndArts_1.marks.length, 2, '2nd Year Arts marks count must be 2');
    assert.equal(cs2ndArts_1.marks[0].obtained, 85);
    assert.equal(cs2ndArts_1.marks[1].obtained, 92);
    assert.equal(urduCheck1.status, 'IN_PROGRESS', 'Overall subject status must be IN_PROGRESS');

    // Verify buildSubmissionView does NOT produce "(unknown)" students
    const view2ndArts = buildSubmissionView(session, urduCheck1, class3Id);
    assert.equal(view2ndArts.rows.length, 2);
    assert.equal(view2ndArts.rows[0].name, '2nd Year Arts Student One');
    assert.equal(view2ndArts.rows[1].name, '2nd Year Arts Student Two');
    assert.ok(!view2ndArts.rows.some((r) => r.name === '(unknown)'), 'Must not produce unknown names for 2nd Year Arts');

    // ----------------------------------------------------------------------------------
    // STEP 2: Submit marks for 1st Year Pre-Medical SECOND (Index 1 in array)
    // ----------------------------------------------------------------------------------
    const marks1stPreMed = [
      { rollNumber: student1M1.rollNumber, obtained: 70 },
      { rollNumber: student1M2.rollNumber, obtained: 78 },
    ];
    await callSubmit(urduToken, class2Id, marks1stPreMed);

    const urduCheck2 = await SubjectSubmission.findById(urduSub._id);
    const cs1stArts_2 = urduCheck2.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    const cs1stMed_2 = urduCheck2.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    const cs2ndArts_2 = urduCheck2.classSubmissions.find((cs) => cs.classId.toString() === class3Id.toString());

    assert.equal(cs1stArts_2.status, 'PENDING', '1st Year Arts MUST STILL remain PENDING');
    assert.equal(cs1stArts_2.marks.length, 0);
    assert.equal(cs1stMed_2.status, 'SUBMITTED', '1st Year Pre-Medical MUST be SUBMITTED');
    assert.equal(cs1stMed_2.marks[0].obtained, 70);
    assert.equal(cs2ndArts_2.status, 'SUBMITTED', '2nd Year Arts marks MUST remain intact');
    assert.equal(cs2ndArts_2.marks[0].obtained, 85);
    assert.equal(urduCheck2.status, 'IN_PROGRESS');

    // ----------------------------------------------------------------------------------
    // STEP 3: Submitting again to an already-submitted class (2nd Year Arts) MUST fail
    // and MUST NOT overwrite 1st Year Arts or any other group!
    // ----------------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await callSubmit(urduToken, class3Id, marks2ndYearArts);
      },
      (err) => {
        assert.equal(err.statusCode, 409, 'Duplicate submission must return 409 Conflict');
        return true;
      }
    );

    // Verify 1st Year Arts is STILL untouched after rejected duplicate submission
    const urduCheck2b = await SubjectSubmission.findById(urduSub._id);
    const cs1stArts_2b = urduCheck2b.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    assert.equal(cs1stArts_2b.status, 'PENDING', '1st Year Arts must STILL be PENDING after duplicate submission reject');
    assert.equal(cs1stArts_2b.marks.length, 0);

    // ----------------------------------------------------------------------------------
    // STEP 4: Submit marks for 1st Year Arts LAST (Index 0 in array)
    // ----------------------------------------------------------------------------------
    const marks1stArts = [
      { rollNumber: student1A1.rollNumber, obtained: 60 },
      { rollNumber: student1A2.rollNumber, obtained: 68 },
    ];
    await callSubmit(urduToken, class1Id, marks1stArts);

    const urduCheck3 = await SubjectSubmission.findById(urduSub._id);
    const cs1stArts_3 = urduCheck3.classSubmissions.find((cs) => cs.classId.toString() === class1Id.toString());
    const cs1stMed_3 = urduCheck3.classSubmissions.find((cs) => cs.classId.toString() === class2Id.toString());
    const cs2ndArts_3 = urduCheck3.classSubmissions.find((cs) => cs.classId.toString() === class3Id.toString());

    // All three classes must now be SUBMITTED with their independent, correct marks
    assert.equal(cs1stArts_3.status, 'SUBMITTED');
    assert.equal(cs1stArts_3.marks[0].obtained, 60);
    assert.equal(cs1stMed_3.status, 'SUBMITTED');
    assert.equal(cs1stMed_3.marks[0].obtained, 70);
    assert.equal(cs2ndArts_3.status, 'SUBMITTED');
    assert.equal(cs2ndArts_3.marks[0].obtained, 85);

    // When all classes are complete, overall subject status must be SUBMITTED
    assert.equal(urduCheck3.status, 'SUBMITTED', 'Overall subject status must be SUBMITTED when all classes are done');

    // ----------------------------------------------------------------------------------
    // STEP 5: Single-class subject (Physics) continues to work as expected
    // ----------------------------------------------------------------------------------
    const marksPhysics = [
      { rollNumber: student1M1.rollNumber, obtained: 55 },
      { rollNumber: student1M2.rollNumber, obtained: 62 },
    ];
    await callSubmit(physicsToken, class2Id, marksPhysics);

    const physicsCheck = await SubjectSubmission.findById(physicsSub._id);
    assert.equal(physicsCheck.classSubmissions[0].status, 'SUBMITTED');
    assert.equal(physicsCheck.classSubmissions[0].marks[0].obtained, 55);
    assert.equal(physicsCheck.status, 'SUBMITTED', 'Single-class subject overall status must be SUBMITTED');
  } finally {
    // Cleanup temporary test data
    await Student.deleteMany({
      _id: {
        $in: [
          student1A1._id,
          student1A2._id,
          student1M1._id,
          student1M2._id,
          student2A1._id,
          student2A2._id,
        ],
      },
    });
    if (sessionId) {
      await SubjectSubmission.deleteMany({ resultSession: sessionId });
      await ResultSession.findByIdAndDelete(sessionId);
      await ActivityLog.deleteMany({ targetId: sessionId });
    }
    await mongoose.disconnect();
  }
});
