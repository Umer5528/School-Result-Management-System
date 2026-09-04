const router = require('express').Router();
const teacherController = require('../controllers/teacherController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const {
  requireRole,
  requirePermission,
  requirePrimarySuperAdmin,
  forbidTargetingPrimarySuperAdmin,
} = require('../middleware/rbac');
const AppError = require('../utils/appError');
const { User } = require('../models');
const {
  createTeacherSchema,
  updateTeacherSchema,
  rejectSchema,
  permissionsSchema,
} = require('../validators/teacherValidators');

router.use(authenticateUser);

// Loads the :id user into req._targetUser and blocks the primary Super
// Admin from ever being a target of these routes.
const loadTarget = forbidTargetingPrimarySuperAdmin(async (req) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('Teacher not found', 404);
  return user;
});

// Admin/AA can view teachers
router.get('/', requirePermission('VIEW_TEACHERS'), teacherController.listTeachers);
router.get('/pending', requirePermission('APPROVE_TEACHERS'), teacherController.listPendingTeachers);
router.get('/:id', requirePermission('VIEW_TEACHERS'), teacherController.getTeacher);
router.get('/:id/results', requirePermission('VIEW_RESULTS'), teacherController.getTeacherResults);
router.get('/:id/students', requirePermission('VIEW_RESULTS'), teacherController.getTeacherStudents);
router.get('/:id/result-sessions', requirePermission('VIEW_RESULTS'), teacherController.getTeacherResultSessions);
router.get(
  '/:id/result-sessions/:sessionId',
  requirePermission('VIEW_RESULTS'),
  teacherController.getTeacherResultSessionDetail
);
router.get(
  '/:id/result-sessions/:sessionId/subjects/:subjectId/submission',
  requirePermission('VIEW_RESULTS'),
  teacherController.getTeacherSubjectSubmission
);
// The one mutation exception in this otherwise read-only admin
// namespace -- spec explicitly grants Super Admin (and permitted
// Assistant Admin) the ability to disable a link or reopen a submission,
// same as the teacher's own controls, gated by MANAGE_RESULTS.
router.patch(
  '/:id/result-sessions/:sessionId/subjects/:subjectId/disable',
  requirePermission('MANAGE_RESULTS'),
  teacherController.adminDisableSubjectLink
);
router.delete(
  '/:id/result-sessions/:sessionId/subjects/:subjectId/submission',
  requirePermission('MANAGE_RESULTS'),
  teacherController.adminReopenSubjectSubmission
);

// Super Admin direct-creates a pre-approved teacher
router.post(
  '/',
  requireRole('super_admin'),
  validate(createTeacherSchema),
  teacherController.createTeacher
);

router.put(
  '/:id',
  requirePermission('VIEW_TEACHERS'),
  loadTarget,
  validate(updateTeacherSchema),
  teacherController.updateTeacher
);

router.patch(
  '/:id/approve',
  requirePermission('APPROVE_TEACHERS'),
  loadTarget,
  teacherController.approveTeacher
);
router.patch(
  '/:id/reject',
  requirePermission('APPROVE_TEACHERS'),
  loadTarget,
  validate(rejectSchema),
  teacherController.rejectTeacher
);
router.patch(
  '/:id/suspend',
  requireRole('super_admin'),
  loadTarget,
  teacherController.suspendTeacher
);
router.patch(
  '/:id/reactivate',
  requireRole('super_admin'),
  loadTarget,
  teacherController.reactivateTeacher
);

router.post(
  '/:id/reset-password',
  requirePermission('RESET_PASSWORDS'),
  loadTarget,
  teacherController.resetTeacherPassword
);

// Owner-only: role transitions and permission grants
router.patch(
  '/:id/promote',
  requirePrimarySuperAdmin,
  loadTarget,
  validate(permissionsSchema),
  teacherController.promoteToAssistantAdmin
);
router.patch(
  '/:id/demote',
  requirePrimarySuperAdmin,
  loadTarget,
  teacherController.demoteToTeacher
);
router.patch(
  '/:id/permissions',
  requirePrimarySuperAdmin,
  loadTarget,
  validate(permissionsSchema),
  teacherController.updatePermissions
);

module.exports = router;
