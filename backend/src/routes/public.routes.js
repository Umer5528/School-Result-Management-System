const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/publicSubmissionController');
const validate = require('../middleware/validate');
const { submitSubjectSchema } = require('../validators/publicSubmissionValidators');

// Guards link brute-forcing -- this is the only endpoint an attacker
// without a valid link can hit at all. Kept separate from the submit
// budget so neither starves the other (see routes.js history for why).
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.get('/submissions/:token', verifyLimiter, controller.getSubmissionInfo);
router.get('/submissions/:token/classes/:classId', verifyLimiter, controller.getClassRoster);
router.post('/submissions/:token/classes/:classId', submitLimiter, validate(submitSubjectSchema), controller.submitClassMarks);
router.post('/submissions/:token/submit', submitLimiter, validate(submitSubjectSchema), controller.submitMarks);

module.exports = router;
