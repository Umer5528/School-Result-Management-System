const { z } = require('zod');

const subjectSchema = z.object({
  name: z.string().min(1),
  totalMarks: z.number().positive(),
  passingMarks: z.number().min(0),
});

const markSchema = z.object({
  subject: z.string().min(1),
  obtained: z.number().min(0),
});

const studentSchema = z.object({
  rollNumber: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  fatherName: z.string().optional(),
  marks: z.array(markSchema).min(1),
});

const createResultSchema = z.object({
  schoolInfo: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      logoUrl: z.string().optional(),
    })
    .optional(),
  class: z.string().min(1),
  section: z.string().optional(),
  academicYear: z.string().min(1),
  examType: z.string().min(1),
  examName: z.string().optional(),
  resultDate: z.coerce.date(),
  totalStrength: z.number().int().positive().optional(),
  subjects: z.array(subjectSchema).min(1),
  students: z.array(studentSchema).min(1),
});

const updateResultSchema = createResultSchema.partial({
  class: true,
  academicYear: true,
  examType: true,
  resultDate: true,
});

// status: null explicitly clears an existing override and reverts to the
// calculated result -- distinct from omitting the field.
const overrideStatusSchema = z.object({
  status: z.enum(['PASS', 'FAIL']).nullable(),
  reason: z.string().max(500).optional(),
});

module.exports = { createResultSchema, updateResultSchema, overrideStatusSchema };
