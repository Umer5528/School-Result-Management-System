const router = require('express').Router();
const controller = require('../controllers/settingsController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { settingsSchema } = require('../validators/settingsValidators');

router.use(authenticateUser);

router.get('/', controller.getSettings);
router.put('/', requireRole('super_admin'), validate(settingsSchema), controller.updateSettings);

module.exports = router;
