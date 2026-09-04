const router = require('express').Router();
const controller = require('../controllers/classProfileController');
const { authenticateUser } = require('../middleware/auth');

router.use(authenticateUser);

router.get('/recent', controller.listRecentClassProfiles);
router.get('/lookup', controller.getClassProfile);

module.exports = router;
