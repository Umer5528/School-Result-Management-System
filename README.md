# School Result Management System (SRMS)

Production-ready MERN application, built module-by-module per the project's
master specification (Modules 1–20 roadmap).

## Structure
- `backend/` — Node.js/Express/MongoDB API
- `frontend/` — React/Vite/Tailwind SPA

## Modules completed so far

**Module 1 — Project Setup**: Express app with security middleware
(helmet, gzip compression, cors, mongo-sanitize, rate limiting on
`/api/auth`), centralized error handler, env config, MongoDB connection,
health check. Vite/React/Tailwind frontend scaffold with the target folder
structure.

**Module 2 — Database schemas**: `User` (role/status/permissions/owner
flag), `Result` (fully embedded historical snapshot), `Announcement`,
`Settings` (singleton), `ActivityLog` — all indexed per the query patterns
the app actually uses.

**Module 3 — Authentication + authorization**: public teacher signup
(`role: teacher, status: pending`), approval-aware login with per-status
messages, JWT issuance/verification, `authenticateUser` middleware (re-
fetches the user so a suspended account is rejected immediately, not just
at token expiry), `requireRole`/`requirePermission`/`requirePrimarySuperAdmin`
RBAC middleware, change-password endpoint, primary-Super-Admin seed script.

**Modules 4–5 — Super Admin & Teacher management**: direct teacher
creation by Super Admin (pre-approved), listing/search/pagination, profile
view with computed stats, approve/reject/suspend/reactivate workflow,
admin-initiated password reset, promote↔demote Teacher/Assistant Admin
(owner-only), granular Assistant Admin permission grants — every mutating
route guarded so the primary Super Admin account can never be targeted.

**Module 6 — Dashboards**: role-aware dashboard (stats, recent results,
pending-approval count for admins with that permission).

**Modules 7–9 — Result creation stepper**: Basic Info → Subjects →
Student Marks (row count locked to configured strength) → Review, with
live client-side calculation preview.

**Module 10 — Calculation/ranking engine**: server-side recalculation of
totals, percentage, pass/fail (per-subject passing marks, independent of
overall %), and **competition ranking** (tied totals share a position;
the next distinct total skips ahead correctly) — the backend never trusts
client-submitted totals.

**Module 11 — Result storage & management**: create/list (filter by
class/section/examType/academicYear/teacher, search, sort, paginate)/get/
update (full server recalculation)/delete, with ownership + permission
checks on every route.

**Module 12 — PDF generation**: `pdfkit`, landscape A4, repeating table
header across pages, page numbers, summary block.

**Module 13 — Excel generation**: `exceljs`, merged school header, frozen
header row, borders, percentage formatting, landscape + fit-to-page, a
second Statistics sheet.

**Module 14 — Assistant Admin permissions**: granular flags
(`VIEW_TEACHERS`, `APPROVE_TEACHERS`, `RESET_PASSWORDS`, `VIEW_RESULTS`,
`MANAGE_RESULTS`, `VIEW_DASHBOARD`, `VIEW_ANNOUNCEMENTS`,
`VIEW_AUDIT_LOGS`) settable only by the primary Super Admin.

**Module 15 — Announcements**: CRUD (Super Admin only), active/in-window
filtering for non-admins, and an app-wide dismissible banner shown on
every dashboard page (not just the Announcements page).

**Module 16 — System settings**: singleton settings document, cached
in-process for 60s (invalidated instantly on update) since it's read far
more often than written.

**Module 17 — Audit logs**: every sensitive action (approvals,
rejections, suspensions, role changes, permission grants, password
resets, result CRUD, announcement/settings changes) is written to
`ActivityLog` and viewable by permitted admins.

**Module 18 — Responsive UI**: sidebar becomes a mobile drawer, tables
scroll horizontally on small screens, layout tested at mobile/tablet/
desktop breakpoints via Tailwind.

**Module 19 — Security hardening (initial pass)**: helmet, gzip
compression, CORS locked to `CLIENT_URL`, mongo-sanitize, rate limiting on
auth, Zod validation on every mutating route, no password hashes ever
serialized, centralized error handler that hides internals in production,
`.lean()` on read-only list queries for lower memory/CPU overhead.

**Module 20 — Testing & deployment prep**: see "Verified so far" below;
formal automated test suite not yet written (next step).

## Verified so far
- Every backend source file passes `node --check` (syntax-clean).
- `backend/src/app.js` successfully requires end-to-end with env vars
  present (module wiring, route mounting, middleware order all correct).
- `frontend` builds cleanly with `npm run build` (Vite production build,
  no import/JSX errors).

## Getting started

### Backend
```bash
cd backend
cp .env.example .env      # then edit MONGO_URI, JWT_SECRET, SUPER_ADMIN_*
npm install
npm run seed:superadmin    # creates the one primary Super Admin
npm run dev                 # http://localhost:5000/api/health
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

You'll need a running MongoDB instance (local `mongod` or MongoDB Atlas)
for `MONGO_URI`.

## Teacher-experience additions (beyond the original 20 modules)

**Autosave & resume ("never lose an hour of work")**: the result wizard
silently autosaves (debounced ~1.5s) to a per-teacher `Draft` document as
they work. If they close the tab, lose wifi, or hit back mid-entry, the
next time they open "Create Result" they're offered a **Resume** or
**Start Fresh** choice instead of a blank form. The draft is cleared
automatically the moment a result is actually generated.

**Remembers the class ("load previous setup")**: every time a result is
generated, the class/subjects/roster (names + roll numbers, never marks)
are saved to a per-teacher `ClassProfile`. Next time they create a result
for that class/section — via the "Recent Classes" quick-pick list on
Step 1, or automatically detected as they type — they can load the whole
setup in one click and go straight to entering this exam's marks.

New backend: `models/Draft.js`, `models/ClassProfile.js`,
`controllers/draftController.js`, `controllers/classProfileController.js`,
routes `/api/drafts` and `/api/class-profiles`. New frontend:
`api/draftsApi.js`, `api/classProfilesApi.js`, `hooks/useDebounce.js`
wired into `CreateResultWizard.jsx`.

## Still remaining from the original build (not yet built)
- Deeper security hardening pass: refresh tokens, request size limits per
  endpoint, structured logging (rate limiting itself is now covered —
  see the Workflow Change section below).
- School logo upload (currently a URL field only).
- A few nice-to-haves: keyboard navigation/auto-focus in the marks table,
  CSV export.

---

# Major Workflow Change: Public Result Submission

Everything below this line documents a large addition on top of the
original 20-module build above. **Nothing above this line changed in a
breaking way** — the original direct-entry "Create Result" wizard, all
auth/approval/RBAC, and every original page still work exactly as before.

## New core concept
Teachers now optionally run exams through a **Result Session** workflow
instead of typing every subject's marks themselves:
1. Register students once (`Student` — permanent roster, independent of
   any exam).
2. Create a **Result Session** (exam details + a frozen snapshot of
   selected students + subject config).
3. Turn on submission → get a secure code/link.
4. Share it with whoever is entering marks — **no account needed**.
5. That person enters one subject's marks through a simple mobile-first
   public flow.
6. The teacher monitors progress, can edit/lock/reopen any submission.
7. Once every subject is in, **Generate Final Result** — which produces
   a normal `Result` document, so the existing Results list, Result
   Details page, and PDF/Excel generation work on it with **zero
   changes**.

## New data model
| Model | Purpose |
|---|---|
| `Student` | Teacher's permanent roster |
| `ResultSession` | An exam in setup/collection phase — frozen student snapshot, subject config, submission token |
| `SubjectSubmission` | Marks for one subject within a session — existence of this doc *is* the "submitted" status |
| `Result` (existing, unchanged schema except one new optional `sourceSessionId`) | The finalized, calculated result |

## New backend surface
```
/api/students                    teacher's own roster CRUD + bulk import
/api/result-sessions              create/list/get, activate/deactivate,
                                   regenerate-token, edit/reopen/lock/unlock
                                   a subject's marks, generate-final
/api/public/sessions/:token        unauthenticated: verify, browse subject,
                                    submit marks (rate-limited, token-scoped
                                    only — no enumeration endpoint exists)
/api/teachers/:id/students          read-only admin visibility
/api/teachers/:id/result-sessions    (Super Admin / permitted Assistant Admin)
```

## Security specifics
- Public routes are reachable *only* by exact token match on an active,
  non-finalized session — no listing/search endpoint anywhere in that
  namespace.
- Split rate limits: a strict budget (15/15min) on code *verification*
  (the brute-force target) separate from a looser one (60/15min) on
  browsing/submitting once a valid code is known, so neither starves the
  other. A general 600/15min limiter now covers every other `/api` route
  as defense-in-depth, plus a dedicated 10/15min limit on token
  regeneration (each regeneration invalidates the old code — spamming it
  is a self-inflicted denial-of-service otherwise).
- One calculation engine: `generateFinalResult` feeds the merged
  `SubjectSubmission` data into the *same* `calculateResult()` the
  original direct-entry wizard uses — verified by actually generating a
  real PDF/Excel from session-sourced data and checking the file
  signatures, not just assuming the shapes matched.
- Admin visibility into a teacher's students/sessions/submissions is
  strictly read-only — no edit/lock/reopen/finalize action exists on the
  `/api/teachers/:id/...` admin routes.

## Automated regression tests
`backend/tests/` — run with `npm test` (Node's built-in test runner, zero
new dependencies). 16 tests covering: per-subject PASS/FAIL vs overall %,
competition ranking with ties, roster-mismatch rejection, submission
token format/collision-safety, and the RBAC middleware's actual
authorization boundaries (Super Admin implicit access, Assistant Admin
permission-gating, the primary-Super-Admin-only guard).

## Mobile responsiveness
Explicit pass covering: mobile drawer sidebar with close button, topbar
that hides secondary text before it would overflow a narrow phone,
modals capped at 85vh with internal scroll (a tall marks table can't push
buttons off-screen), tap-friendly subject cards instead of cramped
tables, and the public submission flow built mobile-first throughout
since external submitters are assumed to mostly be on phones.


---

# Final Workflow Change: Unique Submission Link Per Subject

This supersedes the shared session-level code from the previous section.
**"Submit Result → Enter Code → Select Subject" no longer exists.**

## The change
`SubjectSubmission` is no longer created only after marks arrive — it's
now provisioned the moment a session is **activated** (one document per
subject, `status: PENDING`, its own unique `submissionToken`). Existence
of the doc used to *mean* "submitted"; now `status` is what means that.
`ResultSession.submissionToken` is removed entirely — there is no
session-level link anymore, only per-subject ones.

## Per-subject link lifecycle
```
PENDING  --(public submit)-->  SUBMITTED  --(lock)-->  LOCKED
PENDING  <--(enable)-- DISABLED <--(disable)-- PENDING
SUBMITTED --(reopen)--> PENDING   (same token, marks cleared)
PENDING/DISABLED --(regenerate)--> PENDING   (new token, old one dead immediately)
```

## Security-critical detail
The public submit path uses an **atomic** `findOneAndUpdate({_id, status:
'PENDING'}, {$set: {...status: 'SUBMITTED'}})` rather than check-then-
write — this closes a real race window a naive implementation would have
(two people opening the same link within milliseconds of each other).
The loser gets a proper 409, not a silently overwritten submission.

## What a Mathematics link can never do
Structurally, not just by convention: `findLinkByToken` looks up
*exactly one* `SubjectSubmission` by token. There is no code path from a
subject-scoped token back to the session's other subjects, its other
students, or any other session — the public controller never queries
`ResultSession` for anything except the one session that token's subject
belongs to, and never returns any subject other than that one.

## Admin capability, deliberately narrow
Per the spec, Super Admin / permitted Assistant Admin (via `MANAGE_RESULTS`)
gained exactly two mutation abilities on this workflow — disable a
pending link, reopen a submitted one — reusing the identical state-machine
rules the teacher's own routes enforce. Every other admin route in this
area (activate, edit marks, lock, regenerate) remains teacher-only.

## Verified
Full syntax check, `app.js` load, and the 16-test regression suite all
pass unchanged (the calculation engine and RBAC tests aren't affected by
this change — they test logic this rewrite didn't touch). No local
MongoDB was available in this environment to run a live end-to-end
integration test against a real database, so the new activate → submit →
edit/lock/reopen → finalize lifecycle was verified by careful manual
trace of each state transition and guard condition, not by executing it
against live data — flagging that plainly rather than implying more than
was actually run.

## Not migrated
No production data exists for this project, so no migration script was
written for the schema/enum change. A `ResultSession` created before this
change simply has no working links until its owning teacher re-activates it.
