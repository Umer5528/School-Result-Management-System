const router = require('express').Router();
const auth = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { registerSchema, loginSchema, changePasswordSchema } = require('../validators/authValidators');

router.post('/register', validate(registerSchema), auth.register);
router.post('/login', validate(loginSchema), auth.login);
router.get('/me', authenticateUser, auth.me);
router.post('/change-password', authenticateUser, validate(changePasswordSchema), auth.changePassword);

module.exports = router;
