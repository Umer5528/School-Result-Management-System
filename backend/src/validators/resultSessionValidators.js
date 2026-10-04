const { z } = require('zod');

const subjectSchema = z.object({
  name: z.string().min(1),
  totalMarks: z.number().positive(),
  passingMarks: z.number().min(0),
  allowSubmitterConfig: z.boolean().optional(),
});

const classItemSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    section: z.string().optional(),
  }),
]);

const createSessionSchema = z
  .object({
    examName: z.string().optional(),
    examType: z.string().min(1),
    resultDate: z.coerce.date(),
    academicYear: z.string().min(1),
    class: z.string().optional(),
    section: z.string().optional(),
    classes: z.array(classItemSchema).optional(),
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
  })
  .refine((data) => data.class || (data.classes && data.classes.length > 0), {
    message: 'At least one class must be specified',
    path: ['classes'],
  });

module.exports = { createSessionSchema };
