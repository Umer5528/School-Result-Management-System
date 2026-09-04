const crypto = require('crypto');

// Produces tokens like "RES-8K4P2X" -- short enough for a teacher to read
// aloud or a submitter to type on a phone, but drawn from a large enough
// alphabet/length that it isn't practically guessable. Excludes visually
// ambiguous characters (0/O, 1/I/L) since these get shared verbally or
// via screenshots.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateSubmissionToken() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `RES-${code}`;
}

module.exports = { generateSubmissionToken };
