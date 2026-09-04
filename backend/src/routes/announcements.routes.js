const router = require('express').Router();
const controller = require('../controllers/announcementController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { announcementSchema } = require('../validators/announcementValidators');

router.use(authenticateUser);

router.get('/', controller.listAnnouncements);
router.post('/', requireRole('super_admin'), validate(announcementSchema), controller.createAnnouncement);
router.put('/:id', requireRole('super_admin'), validate(announcementSchema.partial()), controller.updateAnnouncement);
router.delete('/:id', requireRole('super_admin'), controller.deleteAnnouncement);

module.exports = router;
