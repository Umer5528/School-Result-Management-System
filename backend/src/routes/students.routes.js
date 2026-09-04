const router = require('express').Router();
const controller = require('../controllers/studentController');
const validate = require('../middleware/validate');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { studentSchema, updateStudentSchema, bulkImportSchema } = require('../validators/studentValidators');

router.use(authenticateUser);
// Only teachers manage their own roster. Admin visibility into a
// teacher's students happens read-only via /api/teachers/:id (Change
// Module 11), not through this teacher-scoped resource.
router.use(requireRole('teacher'));

router.get('/', controller.listStudents);
router.get('/groups', controller.listGroups);
router.post('/', validate(studentSchema), controller.createStudent);
router.post('/bulk-import', validate(bulkImportSchema), controller.bulkImportStudents);
router.put('/:id', validate(updateStudentSchema), controller.updateStudent);
router.patch('/:id/deactivate', controller.deactivateStudent);
router.patch('/:id/reactivate', controller.reactivateStudent);
router.delete('/:id', controller.deleteStudent);

module.exports = router;
