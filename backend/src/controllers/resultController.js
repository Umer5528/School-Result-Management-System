const { Result, Draft } = require('../models');
const AppError = require('../utils/appError');
const { ok } = require('../utils/apiResponse');
const { calculateResult, recomputePassFailStatistics } = require('../services/resultCalculationService');
const { generateResultPdf } = require('../services/pdfService');
const { generateResultExcel } = require('../services/excelService');
const { logActivity } = require('../services/activityLogService');
const { rememberClassProfile } = require('./classProfileController');
const { paginationParams, paginatedResponse } = require('../utils/pagination');

// A user may see all results if they have MANAGE_RESULTS/VIEW_RESULTS as an
// admin; a plain teacher may only ever see their own. This is enforced
// here, server-side, regardless of what a client requests.
function scopeToOwnResultsUnlessAdmin(req, filter) {
  const user = req.user;
  const isAdmin =
    user.role === 'super_admin' || (user.role === 'assistant_admin' && user.permissions.includes('VIEW_RESULTS'));
  if (!isAdmin) {
    filter.createdBy = user._id;
  } else if (req.query.teacherId) {
    filter.createdBy = req.query.teacherId;
  }
  return filter;
}

async function createResult(req, res) {
  const { subjects, students, totalStrength, ...meta } = req.body;
  const { students: calculatedStudents, statistics } = calculateResult({
    subjects,
    students,
    expectedStrength: totalStrength,
  });

  const result = await Result.create({
    ...meta,
    createdBy: req.user._id,
    teacherNameSnapshot: req.user.name,
    subjects,
    students: calculatedStudents,
    statistics,
  });

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_CREATED',
    targetType: 'Result',
    targetId: result._id,
    metadata: { class: result.class, examType: result.examType, students: statistics.totalStudents },
  });

  // Best-effort, non-blocking: remember this class's setup for next time,
  // and clear the autosaved draft now that the result is actually saved.
  rememberClassProfile({
    teacherId: req.user._id,
    class: result.class,
    section: result.section,
    schoolInfo: result.schoolInfo,
    subjects,
    students: calculatedStudents,
  });
  Draft.deleteOne({ createdBy: req.user._id }).catch(() => {});

  return ok(res, { result }, 'Result generated successfully', 201);
}

async function listResults(req, res) {
  const { page, limit, skip } = paginationParams(req.query);
  const filter = {};
  scopeToOwnResultsUnlessAdmin(req, filter);

  if (req.query.class) filter.class = req.query.class;
  if (req.query.section) filter.section = req.query.section;
  if (req.query.examType) filter.examType = req.query.examType;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.search) {
    filter.examName = new RegExp(req.query.search.trim(), 'i');
  }

  const sortField = ['createdAt', 'resultDate', 'class'].includes(req.query.sortBy)
    ? req.query.sortBy
    : 'createdAt';
  const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Result.find(filter).select('-students').sort({ [sortField]: sortDir }).skip(skip).limit(limit).lean(),
    Result.countDocuments(filter),
  ]);

  return ok(res, paginatedResponse(items, total, page, limit));
}

async function getResultOr404(req) {
  const result = await Result.findById(req.params.id);
  if (!result) throw new AppError('Result not found', 404);

  const user = req.user;
  const isAdmin =
    user.role === 'super_admin' ||
    (user.role === 'assistant_admin' && user.permissions.includes('VIEW_RESULTS'));
  const isOwner = result.createdBy.toString() === user._id.toString();

  if (!isAdmin && !isOwner) {
    throw new AppError('You do not have access to this result', 403);
  }
  return result;
}

async function getResult(req, res) {
  const result = await getResultOr404(req);
  return ok(res, { result });
}

async function updateResult(req, res) {
  const existing = await getResultOr404(req);

  const user = req.user;
  const isOwner = existing.createdBy.toString() === user._id.toString();
  const canManage =
    user.role === 'super_admin' ||
    (user.role === 'assistant_admin' && user.permissions.includes('MANAGE_RESULTS'));
  if (!isOwner && !canManage) {
    throw new AppError('You do not have permission to edit this result', 403);
  }

  const subjects = req.body.subjects || existing.subjects;
  const students = req.body.students || existing.students.map((s) => ({
    rollNumber: s.rollNumber,
    name: s.name,
    fatherName: s.fatherName,
    marks: s.marks,
  }));

  const { students: calculatedStudents, statistics } = calculateResult({
    subjects,
    students,
    expectedStrength: req.body.totalStrength,
  });

  const { totalStrength, ...meta } = req.body;
  Object.assign(existing, meta, {
    subjects,
    students: calculatedStudents,
    statistics,
  });
  await existing.save();

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_UPDATED',
    targetType: 'Result',
    targetId: existing._id,
  });

  return ok(res, { result: existing }, 'Result updated and recalculated');
}

async function deleteResult(req, res) {
  const existing = await getResultOr404(req);
  const user = req.user;
  const isOwner = existing.createdBy.toString() === user._id.toString();
  const canManage = user.role === 'super_admin';
  if (!isOwner && !canManage) {
    throw new AppError('You do not have permission to delete this result', 403);
  }

  await existing.deleteOne();

  await logActivity({
    userId: req.user._id,
    action: 'RESULT_DELETED',
    targetType: 'Result',
    targetId: existing._id,
  });

  return ok(res, null, 'Result deleted');
}

async function downloadPdf(req, res) {
  const result = await getResultOr404(req);
  generateResultPdf(result, res);
}

async function downloadExcel(req, res) {
  const result = await getResultOr404(req);
  const buffer = await generateResultExcel(result);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="result-${result._id}.xlsx"`);
  res.send(Buffer.from(buffer));
}

/**
 * Exercises a teacher's (or admin's) discretion to override one
 * student's final PASS/FAIL outcome -- e.g. passing a student who failed
 * a single subject by a small margin. The calculated `status` and
 * `failedSubjects` are NEVER modified here; they remain the permanent
 * record of what the raw marks actually produced, which is exactly what
 * still needs to print as "Failed: Chemistry" on the PDF/Excel even
 * after the override. Statistics are recomputed from each student's
 * EFFECTIVE status so summary counts stay consistent with what's shown.
 */
async function overrideStudentStatus(req, res) {
  const existing = await getResultOr404(req);

  const user = req.user;
  const isOwner = existing.createdBy.toString() === user._id.toString();
  const canManage =
    user.role === 'super_admin' ||
    (user.role === 'assistant_admin' && user.permissions.includes('MANAGE_RESULTS'));
  if (!isOwner && !canManage) {
    throw new AppError('You do not have permission to override this result', 403);
  }

  const student = existing.students.find((s) => s.rollNumber === req.params.rollNumber);
  if (!student) throw new AppError('Student not found in this result', 404);

  const { status, reason } = req.body;

  student.overriddenStatus = status;
  student.overrideReason = status === null ? undefined : reason;
  student.overriddenBy = status === null ? undefined : user._id;
  student.overriddenAt = status === null ? undefined : new Date();

  Object.assign(existing.statistics, recomputePassFailStatistics(existing.students));
  await existing.save();

  await logActivity({
    userId: user._id,
    action: status === null ? 'STUDENT_RESULT_OVERRIDE_CLEARED' : 'STUDENT_RESULT_OVERRIDDEN',
    targetType: 'Result',
    targetId: existing._id,
    metadata: {
      rollNumber: student.rollNumber,
      name: student.name,
      calculatedStatus: student.status,
      overriddenStatus: status,
      failedSubjects: student.failedSubjects,
      reason,
    },
  });

  return ok(res, { result: existing }, status === null ? 'Override cleared' : 'Student result updated');
}

module.exports = {
  createResult,
  listResults,
  getResult,
  updateResult,
  deleteResult,
  overrideStudentStatus,
  downloadPdf,
  downloadExcel,
};
