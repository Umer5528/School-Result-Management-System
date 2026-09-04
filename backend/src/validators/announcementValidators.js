const { z } = require('zod');

const announcementSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.enum(['information', 'warning', 'maintenance', 'important']).default('information'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  active: z.boolean().optional(),
});

module.exports = { announcementSchema };
