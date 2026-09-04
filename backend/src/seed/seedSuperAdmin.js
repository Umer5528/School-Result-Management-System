const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../config/env');
const { User } = require('../models');
const { SALT_ROUNDS } = require('../controllers/authController');

/**
 * Creates the single primary Super Admin from environment variables.
 * Safe to re-run — it's a no-op if one already exists. This is the ONLY
 * code path in the entire application that may set isPrimarySuperAdmin: true.
 *
 * Usage: npm run seed:superadmin  (backend/.env must have SUPER_ADMIN_* set)
 */
async function seed() {
  const { name, email, password } = env.superAdmin;
  if (!name || !email || !password) {
    console.error(
      '[seed] SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env'
    );
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);

  const existingOwner = await User.findOne({ isPrimarySuperAdmin: true });
  if (existingOwner) {
    console.log(`[seed] Primary Super Admin already exists (${existingOwner.email}) — skipping.`);
    await mongoose.disconnect();
    return;
  }

  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    console.error(`[seed] A user with email ${email} already exists but is not the primary owner. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const owner = await User.create({
    name,
    email,
    passwordHash,
    designation: 'System Owner',
    role: 'super_admin',
    status: 'approved',
    isPrimarySuperAdmin: true,
  });

  console.log(`[seed] Primary Super Admin created: ${owner.email}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
