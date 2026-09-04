const { z } = require('zod');

// Treats an empty string the same as "not provided" for an optional
// field -- a form that includes a blank optional input will send '',
// which is NOT the same as undefined to a plain .optional() schema.
const emptyToUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const studentSchema = z.object({
  rollNumber: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1),
  fatherName: emptyToUndefined(z.string()),
  class: z.string().min(1),
  section: emptyToUndefined(z.string()),
  academicYear: z.string().min(1),
  studentId: emptyToUndefined(z.string()),
});

const updateStudentSchema = studentSchema.partial();

const bulkImportSchema = z.object({
  class: z.string().min(1),
  section: z.string().optional(),
  academicYear: z.string().min(1),
  students: z
    .array(
      z.object({
        rollNumber: z.union([z.string(), z.number()]).transform(String),
        name: z.string().min(1),
        fatherName: z.string().optional(),
      })
    )
    .min(1),
});

module.exports = { studentSchema, updateStudentSchema, bulkImportSchema };
