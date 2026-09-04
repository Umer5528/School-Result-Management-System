const router = require('express').Router();
const controller = require('../controllers/auditController');
const { authenticateUser } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticateUser);
router.get('/', requirePermission('VIEW_AUDIT_LOGS'), controller.listActivityLogs);

module.exports = router;
