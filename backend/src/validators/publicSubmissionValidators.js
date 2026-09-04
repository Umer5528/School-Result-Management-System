const { z } = require('zod');

const submitSubjectSchema = z.object({
  // Only honored server-side if the subject's allowSubmitterConfig is
  // true -- otherwise the session's configured values are used instead
  // and these are ignored, never trusted blindly.
  totalMarks: z.number().positive().optional(),
  passingMarks: z.number().min(0).optional(),
  marks: z
    .array(
      z.object({
        rollNumber: z.union([z.string(), z.number()]).transform(String),
        obtained: z.number().min(0),
      })
    )
    .min(1),
});

module.exports = { submitSubjectSchema };
