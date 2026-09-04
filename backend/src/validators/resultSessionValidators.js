const { z } = require('zod');

const subjectSchema = z.object({
  name: z.string().min(1),
  totalMarks: z.number().positive(),
  passingMarks: z.number().min(0),
  allowSubmitterConfig: z.boolean().optional(),
});

const createSessionSchema = z.object({
  examName: z.string().optional(),
  examType: z.string().min(1),
  resultDate: z.coerce.date(),
  academicYear: z.string().min(1),
  class: z.string().min(1),
  section: z.string().optional(),
  schoolInfo: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      logoUrl: z.string().optional(),
    })
    .optional(),
  studentIds: z.array(z.string()).min(1, 'Select at least one student'),
  subjects: z.array(subjectSchema).min(1),
});

module.exports = { createSessionSchema };
