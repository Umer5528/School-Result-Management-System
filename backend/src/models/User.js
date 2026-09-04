const mongoose = require('mongoose');

const ROLES = ['teacher', 'assistant_admin', 'super_admin'];
const STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

// Granular permission flags an Assistant Admin can be granted by the
// Super Admin. Teachers and Super Admin never read this list — Teachers
// have no admin permissions, Super Admin implicitly has everything.
const ASSISTANT_PERMISSIONS = [
  'VIEW_TEACHERS',
  'APPROVE_TEACHERS',
  'RESET_PASSWORDS',
  'VIEW_RESULTS',
  'MANAGE_RESULTS',
  'VIEW_DASHBOARD',
  'VIEW_ANNOUNCEMENTS',
  'VIEW_AUDIT_LOGS',
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    employeeId: { type: String, trim: true, unique: true, sparse: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    qualification: { type: String, trim: true },
    designation: { type: String, trim: true },
    schoolName: { type: String, trim: true },
    address: { type: String, trim: true },

    role: { type: String, enum: ROLES, default: 'teacher', index: true },
    permissions: {
      type: [{ type: String, enum: ASSISTANT_PERMISSIONS }],
      default: [],
    },

    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    rejectionReason: { type: String, trim: true },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    suspendedAt: { type: Date },

    // Exactly one seeded document may have this set to true. Every
    // owner-level guard in the RBAC middleware checks this flag, not role,
    // so role alone can never be used to impersonate the primary owner.
    isPrimarySuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;
module.exports.ASSISTANT_PERMISSIONS = ASSISTANT_PERMISSIONS;
