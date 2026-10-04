const router = require('express').Router();
const resultController = require('../controllers/resultController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { createResultSchema, updateResultSchema, overrideStatusSchema } = require('../validators/resultValidators');

router.use(authenticateUser);

// Every teacher may create/view/download their own results; broader
// visibility is enforced inside the controller based on role/permissions,
// not at the route level, since "own vs all" depends on data ownership.
router.post('/', validate(createResultSchema), resultController.createResult);
router.get('/', resultController.listResults);
router.get('/:id', resultController.getResult);
router.put('/:id', validate(updateResultSchema), resultController.updateResult);
router.delete('/:id/permanent', resultController.deleteResult);
router.delete('/:id', resultController.deleteResult);
router.patch(
  '/:id/students/:rollNumber/override',
  validate(overrideStatusSchema),
  resultController.overrideStudentStatus
);
router.get('/:id/pdf', resultController.downloadPdf);
router.get('/:id/excel', resultController.downloadExcel);

module.exports = router;
