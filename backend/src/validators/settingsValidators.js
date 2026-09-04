const { z } = require('zod');

const settingsSchema = z.object({
  systemName: z.string().optional(),
  schoolName: z.string().optional(),
  adminEmail: z.string().email().optional(),
  adminPhone: z.string().optional(),
  logoUrl: z.string().optional(),
  defaultAcademicYear: z.string().optional(),
});

module.exports = { settingsSchema };
