const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/resultSessionController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { createSessionSchema } = require('../validators/resultSessionValidators');
const { editSubmissionSchema } = require('../validators/subjectSubmissionValidators');

// Each regeneration invalidates the previous link immediately -- doing
// this repeatedly can lock out a legitimate submitter holding the old
// link. Deliberately tighter than the general API limiter.
const regenerateTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // per-subject now, so a teacher regenerating several subjects' links legitimately needs more headroom than the old single-session limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many link regenerations. Please wait before trying again.' },
});

router.use(authenticateUser);
router.use(requireRole('teacher', 'assistant_admin', 'super_admin'));

router.get('/', controller.listSessions);
router.post('/', validate(createSessionSchema), controller.createSession);
router.get('/:id', controller.getSession);

router.get('/:id/subjects/:subjectId/submission', controller.getSubjectSubmission);
router.get('/:id/subjects/:subjectId/classes/:classId/submission', controller.getSubjectSubmission);
router.put('/:id/subjects/:subjectId/submission', validate(editSubmissionSchema), controller.editSubjectSubmission);
router.put('/:id/subjects/:subjectId/classes/:classId/submission', validate(editSubmissionSchema), controller.editSubjectSubmission);
router.delete('/:id/subjects/:subjectId/submission', controller.reopenSubjectSubmission);
router.post('/:id/subjects/:subjectId/classes/:classId/reopen', controller.reopenSubjectSubmission);
router.patch('/:id/subjects/:subjectId/lock', controller.lockSubject);
router.patch('/:id/subjects/:subjectId/unlock', controller.unlockSubject);
router.patch('/:id/subjects/:subjectId/disable', controller.disableSubjectLink);
router.patch('/:id/subjects/:subjectId/enable', controller.enableSubjectLink);
router.post('/:id/subjects/:subjectId/regenerate-token', regenerateTokenLimiter, controller.regenerateSubjectToken);

router.patch('/:id/activate', controller.activateSession);
router.patch('/:id/deactivate', controller.deactivateSession);
router.post('/:id/classes/:classId/generate-final', controller.generateClassFinalResult);
router.post('/:id/generate-final', controller.generateFinalResult);

// Permanent deletion routes
router.delete('/:id/classes/:classId/permanent', controller.deleteClassResultPermanently);
router.delete('/:id/permanent', controller.deleteEntireExamPermanently);
router.delete('/:id', controller.deleteEntireExamPermanently);

module.exports = router;
