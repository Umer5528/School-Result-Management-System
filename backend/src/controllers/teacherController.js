const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Result, Student, ResultSession, SubjectSubmission } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { toPublicUser, SALT_ROUNDS } = require('./authController');
const { logActivity } = require('../services/activityLogService');
const { paginationParams, paginatedResponse } = require('../utils/pagination');
const { attachSubmissionStatus, attachSubmissionCounts, buildSubmissionView } = require('../services/resultSessionViewService');

// ---------- Super Admin: direct teacher creation (no approval needed) ----------

async function createTeacher(req, res) {
  const { password, ...rest } = req.body;
  const existing = await User.findOne({ email: rest.email });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const teacher = await User.create({
    ...rest,
    passwordHash,
    role: 'teacher',
    status: 'approved',
    approvedBy: req.user._id,
    approvedAt: new Date(),
  });

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_CREATED_BY_ADMIN',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher account created', 201);
}

// ---------- Listing / viewing ----------

async function listTeachers(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = { role: { $in: ['teacher', 'assistant_admin'] } };

  if (req.query.status) filter.status = req.query.status;
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    const re = new RegExp(req.query.search.trim(), 'i');
    filter.$or = [{ name: re }, { email: re }, { employeeId: re }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return ok(res, paginatedResponse(items.map(toPublicUser), total, page, limit));
}

async function listPendingTeachers(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = { status: 'pending' };

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return ok(res, paginatedResponse(items.map(toPublicUser), total, page, limit));
}

async function getTeacher(req, res) {
  const teacher = req._targetUser || (await User.findById(req.params.id));
  if (!teacher) throw new AppError('Teacher not found', 404);

  const [totalResults, totalStudentsAgg] = await Promise.all([
    Result.countDocuments({ createdBy: teacher._id }),
    Result.aggregate([
      { $match: { createdBy: teacher._id } },
      { $group: { _id: null, total: { $sum: { $size: '$students' } } } },
    ]),
  ]);

  return ok(res, {
    user: toPublicUser(teacher),
    stats: {
      totalResults,
      totalStudentsProcessed: totalStudentsAgg[0]?.total || 0,
    },
  });
}

async function getTeacherResults(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = { createdBy: req.params.id };
  const [items, total] = await Promise.all([
    Result.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-students').lean(),
    Result.countDocuments(filter),
  ]);
  return ok(res, paginatedResponse(items, total, page, limit));
}

// ---------- Read-only admin visibility: Teacher -> Students -> Result
// Sessions -> Subject Submissions -> Final Results (Change Module 11) ----------
// Every function below is read-only by design -- Super Admin / permitted
// Assistant Admin can SEE a teacher's workflow-in-progress data, never
// edit, lock, reopen, or finalize it. Those actions stay exclusively on
// the teacher's own routes in resultSessions.routes.js.

async function getTeacherStudents(req, res) {
  const { page, limit, skip } = paginationParams(req.query, { defaultLimit: 50, maxLimit: 500 });
  const filter = { createdBy: req.params.id };
  if (req.query.class) filter.class = req.query.class;
  if (req.query.section) filter.section = req.query.section;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;

  const [items, total] = await Promise.all([
    Student.find(filter).sort({ rollNumber: 1 }).skip(skip).limit(limit).lean(),
    Student.countDocuments(filter),
  ]);
  return ok(res, paginatedResponse(items, total, page, limit));
}

async function getTeacherResultSessions(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = { createdBy: req.params.id };
  if (req.query.status) filter.submissionStatus = req.query.status;

  const [items, total] = await Promise.all([
    ResultSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ResultSession.countDocuments(filter),
  ]);
  await attachSubmissionCounts(items);

  return ok(res, paginatedResponse(items, total, page, limit));
}

async function getTeacherResultSessionDetail(req, res) {
  const session = await ResultSession.findOne({ _id: req.params.sessionId, createdBy: req.params.id });
  if (!session) throw new AppError('Result session not found', 404);

  const sessionObj = await attachSubmissionStatus(session);
  return ok(res, { session: sessionObj });
}

async function findAdminSubjectLink(req) {
  const session = await ResultSession.findOne({ _id: req.params.sessionId, createdBy: req.params.id });
  if (!session) throw new AppError('Result session not found', 404);

  const subject = session.subjects.id(req.params.subjectId);
  if (!subject) throw new AppError('Subject not found in this result session', 404);

  const link = await SubjectSubmission.findOne({ resultSession: session._id, subjectId: subject._id });
  if (!link) throw new AppError('This subject\'s submission link has not been generated yet', 404);

  return { session, subject, link };
}

async function getTeacherSubjectSubmission(req, res) {
  const { session, subject, link } = await findAdminSubjectLink(req);
  const classId = req.params.classId || req.query.classId || null;
  return ok(res, { submission: buildSubmissionView(session, link, classId) });
}

// ---------- Admin mutation: disable/reopen a subject link (spec:
// "Super Admin should be able to: ... Disable links, Reopen submissions")
// -- the one deliberate exception to this file's otherwise read-only
// visibility pattern, reusing the same state-machine rules the teacher's
// own routes enforce. ----------

async function adminDisableSubjectLink(req, res) {
  const { session, subject, link } = await findAdminSubjectLink(req);
  link.status = 'DISABLED';
  await link.save();

  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_LINK_DISABLED_BY_ADMIN',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: { subjectId: subject._id, subjectName: subject.name, teacherId: session.createdBy },
  });

  return ok(res, { link }, `${subject.name} link disabled`);
}

async function adminReopenSubjectSubmission(req, res) {
  const { session, subject, link } = await findAdminSubjectLink(req);
  const classId = req.params.classId || req.query.classId || req.body?.classId;
  const { normalizeClasses } = require('../services/resultSessionViewService');
  const normClasses = normalizeClasses(session);
  const targetClass = classId
    ? normClasses.find((c) => c._id.toString() === classId.toString() || c.name === classId)
    : normClasses[0];

  const classSub = link.classSubmissions?.find(
    (cs) => (cs.classId && cs.classId.toString() === targetClass?._id.toString()) || cs.className === targetClass?.name
  );

  if (classSub) {
    if (classSub.status === 'LOCKED') throw new AppError('Unlock this subject before reopening it', 400);
    const clearedMarks = [...classSub.marks];
    const clearedAt = classSub.submittedAt;

    await logActivity({
      userId: req.user._id,
      action: 'SUBJECT_REOPENED_BY_ADMIN',
      targetType: 'ResultSession',
      targetId: session._id,
      metadata: {
        subjectId: subject._id,
        subjectName: subject.name,
        teacherId: session.createdBy,
        classId: targetClass._id,
        className: targetClass.name,
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
    return ok(res, { link }, `${targetClass.name} ${subject.name} reopened`);
  }

  // Fallback for legacy doc
  if (link.status === 'LOCKED') throw new AppError('Unlock this subject before reopening it', 400);
  await logActivity({
    userId: req.user._id,
    action: 'SUBJECT_REOPENED_BY_ADMIN',
    targetType: 'ResultSession',
    targetId: session._id,
    metadata: {
      subjectId: subject._id,
      subjectName: subject.name,
      teacherId: session.createdBy,
      clearedMarks: link.marks,
      clearedAt: link.submittedAt,
    },
  });

  link.marks = [];
  link.status = 'PENDING';
  link.submittedAt = null;
  link.submittedVia = null;
  await link.save();

  return ok(res, { link }, `${subject.name} reopened`);
}

// ---------- Update ----------

async function updateTeacher(req, res) {
  const teacher = req._targetUser;
  Object.assign(teacher, req.body);
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_UPDATED',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher updated');
}

// ---------- Approval workflow ----------

async function approveTeacher(req, res) {
  const teacher = req._targetUser;
  if (teacher.status === 'approved') throw new AppError('Teacher is already approved', 400);

  teacher.status = 'approved';
  teacher.approvedBy = req.user._id;
  teacher.approvedAt = new Date();
  teacher.rejectionReason = undefined;
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_APPROVED',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher approved');
}

async function rejectTeacher(req, res) {
  const teacher = req._targetUser;
  teacher.status = 'rejected';
  teacher.rejectedBy = req.user._id;
  teacher.rejectedAt = new Date();
  teacher.rejectionReason = req.body.reason;
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_REJECTED',
    targetType: 'User',
    targetId: teacher._id,
    metadata: { reason: req.body.reason },
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher rejected');
}

async function suspendTeacher(req, res) {
  const teacher = req._targetUser;
  teacher.status = 'suspended';
  teacher.suspendedBy = req.user._id;
  teacher.suspendedAt = new Date();
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_SUSPENDED',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher suspended');
}

async function reactivateTeacher(req, res) {
  const teacher = req._targetUser;
  teacher.status = 'approved';
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'TEACHER_REACTIVATED',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher reactivated');
}

// ---------- Role / permissions ----------

async function promoteToAssistantAdmin(req, res) {
  const teacher = req._targetUser;
  if (teacher.status !== 'approved') {
    throw new AppError('Only an approved teacher can be promoted', 400);
  }
  if (teacher.role !== 'teacher') {
    throw new AppError('Only a teacher can be promoted to Assistant Admin', 400);
  }

  teacher.role = 'assistant_admin';
  teacher.permissions = req.body.permissions || [];
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'PROMOTED_TO_ASSISTANT_ADMIN',
    targetType: 'User',
    targetId: teacher._id,
    metadata: { permissions: teacher.permissions },
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Teacher promoted to Assistant Admin');
}

async function demoteToTeacher(req, res) {
  const teacher = req._targetUser;
  if (teacher.role !== 'assistant_admin') {
    throw new AppError('Only an Assistant Admin can be demoted', 400);
  }

  teacher.role = 'teacher';
  teacher.permissions = [];
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'DEMOTED_TO_TEACHER',
    targetType: 'User',
    targetId: teacher._id,
  });

  return ok(res, { user: toPublicUser(teacher) }, 'Assistant Admin demoted to Teacher');
}

async function updatePermissions(req, res) {
  const target = req._targetUser;
  if (target.role !== 'assistant_admin') {
    throw new AppError('Permissions only apply to Assistant Admins', 400);
  }
  target.permissions = req.body.permissions;
  await target.save();

  await logActivity({
    userId: req.user._id,
    action: 'ASSISTANT_PERMISSIONS_UPDATED',
    targetType: 'User',
    targetId: target._id,
    metadata: { permissions: target.permissions },
  });

  return ok(res, { user: toPublicUser(target) }, 'Permissions updated');
}

// ---------- Password reset (admin-initiated) ----------

async function resetTeacherPassword(req, res) {
  const teacher = req._targetUser;
  const tempPassword = crypto.randomBytes(6).toString('hex');
  teacher.passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
  await teacher.save();

  await logActivity({
    userId: req.user._id,
    action: 'PASSWORD_RESET_BY_ADMIN',
    targetType: 'User',
    targetId: teacher._id,
  });

  // Returned directly since this project has no email service configured;
  // swap this for an email dispatch once one is wired up.
  return ok(res, { temporaryPassword: tempPassword }, 'Password reset. Share the temporary password with the teacher securely.');
}

module.exports = {
  createTeacher,
  listTeachers,
  listPendingTeachers,
  getTeacher,
  getTeacherResults,
  getTeacherStudents,
  getTeacherResultSessions,
  getTeacherResultSessionDetail,
  getTeacherSubjectSubmission,
  adminDisableSubjectLink,
  adminReopenSubjectSubmission,
  updateTeacher,
  approveTeacher,
  rejectTeacher,
  suspendTeacher,
  reactivateTeacher,
  promoteToAssistantAdmin,
  demoteToTeacher,
  updatePermissions,
  resetTeacherPassword,
};
