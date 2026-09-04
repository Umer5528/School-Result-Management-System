const { z } = require('zod');
const { passwordRule } = require('./authValidators');

const createTeacherSchema = z.object({
  name: z.string().min(2),
  fatherName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  qualification: z.string().optional(),
  designation: z.string().min(1),
  schoolName: z.string().optional(),
  address: z.string().optional(),
  password: passwordRule,
});

const updateTeacherSchema = z.object({
  name: z.string().min(2).optional(),
  fatherName: z.string().optional(),
  phone: z.string().optional(),
  employeeId: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  qualification: z.string().optional(),
  designation: z.string().optional(),
  schoolName: z.string().optional(),
  address: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().optional(),
});

const permissionsSchema = z.object({
  permissions: z.array(z.string()),
});

module.exports = { createTeacherSchema, updateTeacherSchema, rejectSchema, permissionsSchema };
