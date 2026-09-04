const { z } = require('zod');

const editSubmissionSchema = z.object({
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

module.exports = { editSubmissionSchema };
