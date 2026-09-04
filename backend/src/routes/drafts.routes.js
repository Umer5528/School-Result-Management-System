const router = require('express').Router();
const controller = require('../controllers/draftController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { draftSchema } = require('../validators/draftValidators');

router.use(authenticateUser);

router.get('/mine', controller.getMyDraft);
router.put('/mine', validate(draftSchema), controller.saveDraft);
router.delete('/mine', controller.deleteMyDraft);

module.exports = router;
