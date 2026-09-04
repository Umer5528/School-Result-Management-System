// Local-only autosave for the public (unauthenticated) marks-submission
// form. No backend involved at all -- a submitter's token already
// identifies exactly one subject 1:1 (see the per-subject-link rewrite),
// so the token alone is a safe, unique draft key. This protects against
// a dead phone or an accidental back-button mid-entry; it does NOT sync
// across devices, and it's wiped the moment a submission actually
// succeeds so a stale draft can never resurface for a subject that's
// already done.
const PREFIX = 'srms_submit_draft:';

function keyFor(token) {
  return `${PREFIX}${token}`;
}

export function loadDraft(token) {
  try {
    const raw = window.localStorage.getItem(keyFor(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    // Corrupted entry or storage unavailable (e.g. private browsing) --
    // treat exactly like no draft rather than breaking the page.
    return null;
  }
}

export function saveDraft(token, data) {
  try {
    window.localStorage.setItem(keyFor(token), JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable -- autosave is a nicety, never worth
    // interrupting the submitter over.
  }
}

export function clearDraft(token) {
  try {
    window.localStorage.removeItem(keyFor(token));
  } catch {
    // Nothing meaningful to do if this fails.
  }
}

// A draft is only worth offering if it actually has at least one mark
// entered -- an empty/blank draft from someone who verified and left
// immediately isn't worth a restore prompt.
export function draftHasContent(draft) {
  return !!draft && draft.marks && Object.values(draft.marks).some((v) => v !== undefined && v !== '');
}
