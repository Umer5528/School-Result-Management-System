const { z } = require('zod');

// Deliberately loose — this mirrors whatever shape the wizard's local
// state happens to be in mid-edit, which may be incomplete/invalid by
// the standards of a real result. Only the outer shape is enforced.
const draftSchema = z.object({
  step: z.number().int().min(0).max(3).optional(),
  basicInfo: z.record(z.any()).optional(),
  subjects: z.array(z.any()).optional(),
  students: z.array(z.any()).optional(),
});

module.exports = { draftSchema };
