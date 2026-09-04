const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSubmissionToken } = require('../src/utils/submissionToken');

test('generateSubmissionToken: correct format (RES-XXXXXX, unambiguous alphabet)', () => {
  for (let i = 0; i < 1000; i++) {
    const token = generateSubmissionToken();
    assert.match(token, /^RES-[A-Z0-9]{6}$/);
    // Excludes visually ambiguous characters that get mis-typed/mis-read
    // when a code is shared verbally or via a screenshot.
    assert.doesNotMatch(token, /[01OIL]/, `token ${token} contains an ambiguous character`);
  }
});

test('generateSubmissionToken: no collisions across a sample (collision protection itself lives in the DB-level retry loop in activateSession/regenerateToken, not here)', () => {
  const seen = new Set();
  // ~32^6 possible tokens (~1.07 billion). At this sample size the
  // birthday-paradox collision probability is ~0.05% -- low enough to be
  // a meaningful sanity check without being a flaky test. (A 20,000-token
  // sample would have a real ~17% chance of one incidental collision even
  // with perfectly good randomness -- that's what the app's own retry
  // loop exists to handle, not something this unit test should assert away.)
  const sampleSize = 1000;
  for (let i = 0; i < sampleSize; i++) {
    seen.add(generateSubmissionToken());
  }
  assert.equal(seen.size, sampleSize, 'every generated token in the sample must be unique');
});
