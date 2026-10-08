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
    group: z.string().optional(),
    section: z.string().optional(),
    displayName: z.string().optional(),
    subjects: z.array(subjectSchema).optional(),
  }),
]);

const createSessionSchema = z
  .object({
    examName: z.string().optional(),
    examType: z.string().min(1),
    resultDate: z.coerce.date(),
    academicYear: z.string().min(1),
    class: z.string().optional(),
    group: z.string().optional(),
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
    subjects: z.array(subjectSchema).optional(),
  })
  .refine((data) => data.class || (data.classes && data.classes.length > 0), {
    message: 'At least one class must be specified',
    path: ['classes'],
  })
  .refine(
    (data) => {
      if (Array.isArray(data.subjects) && data.subjects.length > 0) return true;
      if (
        Array.isArray(data.classes) &&
        data.classes.some((c) => typeof c === 'object' && Array.isArray(c.subjects) && c.subjects.length > 0)
      ) {
        return true;
      }
      return false;
    },
    {
      message: 'At least one subject is required',
      path: ['subjects'],
    }
  );

module.exports = { createSessionSchema, subjectSchema, classItemSchema };
