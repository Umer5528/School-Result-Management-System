const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole, requirePermission, requirePrimarySuperAdmin } = require('../src/middleware/rbac');

function mockReq(user) {
  return { user };
}
function callMiddleware(mw, user) {
  let called = false;
  let error = null;
  const next = () => { called = true; };
  try {
    mw(mockReq(user), {}, next);
  } catch (err) {
    error = err;
  }
  return { called, error };
}

test('requireRole: allows a matching role and blocks a non-matching one', () => {
  const mw = requireRole('super_admin', 'assistant_admin');
  assert.equal(callMiddleware(mw, { role: 'super_admin' }).called, true);
  assert.equal(callMiddleware(mw, { role: 'assistant_admin' }).called, true);

  const blocked = callMiddleware(mw, { role: 'teacher' });
  assert.equal(blocked.called, false);
  assert.equal(blocked.error.statusCode, 403);
});

test('requirePermission: Super Admin always passes regardless of the permissions array', () => {
  const mw = requirePermission('APPROVE_TEACHERS');
  const result = callMiddleware(mw, { role: 'super_admin', permissions: [] });
  assert.equal(result.called, true, 'Super Admin has implicit full access');
});

test('requirePermission: Assistant Admin only passes with the exact granted permission', () => {
  const mw = requirePermission('APPROVE_TEACHERS');

  const granted = callMiddleware(mw, { role: 'assistant_admin', permissions: ['APPROVE_TEACHERS'] });
  assert.equal(granted.called, true);

  const notGranted = callMiddleware(mw, { role: 'assistant_admin', permissions: ['VIEW_TEACHERS'] });
  assert.equal(notGranted.called, false);
  assert.equal(notGranted.error.statusCode, 403);
});

test('requirePermission: Teacher never passes, even with a permissions array present', () => {
  const mw = requirePermission('VIEW_RESULTS');
  const result = callMiddleware(mw, { role: 'teacher', permissions: ['VIEW_RESULTS'] });
  assert.equal(result.called, false, 'permissions array is only meaningful for assistant_admin');
});

test('requirePrimarySuperAdmin: only the seeded owner account passes, never a regular super_admin', () => {
  const blocked = callMiddleware(requirePrimarySuperAdmin, { role: 'super_admin', isPrimarySuperAdmin: false });
  assert.equal(blocked.called, false);
  assert.equal(blocked.error.statusCode, 403);

  const allowed = callMiddleware(requirePrimarySuperAdmin, { role: 'super_admin', isPrimarySuperAdmin: true });
  assert.equal(allowed.called, true);
});
