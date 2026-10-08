const { Student } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { logActivity } = require('../services/activityLogService');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

// Every route in this controller is scoped to req.user's own students —
// a Teacher only ever sees/edits their own roster. Admins get read access
// to any teacher's students via the separate teacherController routes,
// not through here.
function ownerFilter(req, extra = {}) {
  return { createdBy: req.user._id, ...extra };
}

async function createStudent(req, res) {
  const existing = await Student.findOne(
    ownerFilter(req, {
      class: req.body.class,
      group: req.body.group || '',
      section: req.body.section || '',
      academicYear: req.body.academicYear,
      rollNumber: req.body.rollNumber,
    })
  );
  if (existing) {
    throw new AppError(
      `Roll number ${req.body.rollNumber} already exists in this class/group/section/year`,
      409
    );
  }

  const student = await Student.create({
    ...req.body,
    group: req.body.group || '',
    createdBy: req.user._id,
  });
  await logActivity({
    userId: req.user._id,
    action: 'STUDENT_CREATED',
    targetType: 'Student',
    targetId: student._id,
  });
  return ok(res, { student }, 'Student added', 201);
}

async function bulkImportStudents(req, res) {
  const { class: className, group = '', section = '', academicYear, students } = req.body;

  const rollNumbers = students.map((s) => s.rollNumber);
  const duplicates = rollNumbers.filter((r, i) => rollNumbers.indexOf(r) !== i);
  if (duplicates.length > 0) {
    throw new AppError(`Duplicate roll numbers in import: ${[...new Set(duplicates)].join(', ')}`, 400);
  }

  const existing = await Student.find(
    ownerFilter(req, {
      class: className,
      group: group || '',
      section: section || '',
      academicYear,
      rollNumber: { $in: rollNumbers },
    })
  ).select('rollNumber');
  if (existing.length > 0) {
    throw new AppError(
      `These roll numbers already exist: ${existing.map((s) => s.rollNumber).join(', ')}`,
      409
    );
  }

  const docs = await Student.insertMany(
    students.map((s) => ({
      ...s,
      class: className,
      group: group || '',
      section: section || '',
      academicYear,
      createdBy: req.user._id,
    }))
  );

  await logActivity({
    userId: req.user._id,
    action: 'STUDENTS_BULK_IMPORTED',
    metadata: { class: className, group, section, academicYear, count: docs.length },
  });

  return ok(res, { students: docs, count: docs.length }, `${docs.length} students imported`, 201);
}

async function listStudents(req, res) {
  const { page, limit, skip } = paginationParams(req.query, { defaultLimit: 50, maxLimit: 500 });
  const filter = ownerFilter(req);
  if (req.query.class && req.query.class.trim()) filter.class = req.query.class.trim();
  if (req.query.group && req.query.group.trim()) filter.group = req.query.group.trim();
  if (req.query.section && req.query.section.trim()) filter.section = req.query.section.trim();
  if (req.query.academicYear && req.query.academicYear.trim()) filter.academicYear = req.query.academicYear.trim();
  if (req.query.active !== undefined && req.query.active !== '') filter.active = req.query.active === 'true';
  if (req.query.search) {
    const re = new RegExp(req.query.search.trim(), 'i');
    filter.$or = [{ name: re }, { rollNumber: re }, { studentId: re }];
  }

  const [items, total] = await Promise.all([
    Student.find(filter).sort({ rollNumber: 1 }).skip(skip).limit(limit).lean(),
    Student.countDocuments(filter),
  ]);

  return ok(res, paginatedResponse(items, total, page, limit));
}

// Distinct class/group/section/year combinations this teacher has students in —
// powers the filter dropdowns and the "select students" step of the
// result session wizard.
async function listGroups(req, res) {
  const groups = await Student.aggregate([
    { $match: ownerFilter(req) },
    {
      $group: {
        _id: {
          class: '$class',
          group: { $ifNull: ['$group', ''] },
          section: { $ifNull: ['$section', ''] },
          academicYear: '$academicYear',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.academicYear': -1, '_id.class': 1, '_id.group': 1, '_id.section': 1 } },
  ]);
  return ok(res, groups.map((g) => ({ ...g._id, count: g.count })));
}

async function getStudentOrThrow(req) {
  const student = await Student.findOne(ownerFilter(req, { _id: req.params.id }));
  if (!student) throw new AppError('Student not found', 404);
  return student;
}

async function updateStudent(req, res) {
  const student = await getStudentOrThrow(req);
  const targetClass = req.body.class !== undefined ? req.body.class : student.class;
  const targetGroup = req.body.group !== undefined ? req.body.group : student.group;
  const targetSection = req.body.section !== undefined ? req.body.section : student.section;
  const targetYear = req.body.academicYear !== undefined ? req.body.academicYear : student.academicYear;
  const targetRoll = req.body.rollNumber !== undefined ? req.body.rollNumber : student.rollNumber;

  if (
    targetRoll !== student.rollNumber ||
    targetClass !== student.class ||
    targetGroup !== student.group ||
    targetSection !== student.section ||
    targetYear !== student.academicYear
  ) {
    const existing = await Student.findOne(
      ownerFilter(req, {
        _id: { $ne: student._id },
        class: targetClass,
        group: targetGroup || '',
        section: targetSection || '',
        academicYear: targetYear,
        rollNumber: targetRoll,
      })
    );
    if (existing) {
      throw new AppError(
        `Roll number ${targetRoll} already exists in this class/group/section/year`,
        409
      );
    }
  }

  Object.assign(student, req.body);
  if (req.body.group !== undefined) {
    student.group = req.body.group || '';
  }
  await student.save();

  await logActivity({
    userId: req.user._id,
    action: 'STUDENT_UPDATED',
    targetType: 'Student',
    targetId: student._id,
  });

  return ok(res, { student }, 'Student updated');
}

async function deactivateStudent(req, res) {
  const student = await getStudentOrThrow(req);
  student.active = false;
  await student.save();

  await logActivity({
    userId: req.user._id,
    action: 'STUDENT_DEACTIVATED',
    targetType: 'Student',
    targetId: student._id,
  });

  return ok(res, { student }, 'Student deactivated');
}

async function reactivateStudent(req, res) {
  const student = await getStudentOrThrow(req);
  student.active = true;
  await student.save();

  await logActivity({
    userId: req.user._id,
    action: 'STUDENT_REACTIVATED',
    targetType: 'Student',
    targetId: student._id,
  });

  return ok(res, { student }, 'Student reactivated');
}

async function deleteStudent(req, res) {
  const student = await getStudentOrThrow(req);
  await student.deleteOne();

  await logActivity({
    userId: req.user._id,
    action: 'STUDENT_DELETED',
    targetType: 'Student',
    targetId: student._id,
  });

  return ok(res, null, 'Student deleted');
}

module.exports = {
  createStudent,
  bulkImportStudents,
  listStudents,
  listGroups,
  updateStudent,
  deactivateStudent,
  reactivateStudent,
  deleteStudent,
};
