const { z } = require('zod');

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Invalid email address'),
    designation: z.string().min(1, 'Designation is required'),
    password: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordRule,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

module.exports = { registerSchema, loginSchema, changePasswordSchema, passwordRule };
