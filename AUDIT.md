# QuestLearn product audit

**Date:** 13 November 2026
**Auditor stance:** signed-in administrator testing the product as a school would.
**Scope:** authentication, student learning flow, instructor authoring, admin moderation,
accessibility, security posture, production profile, CI, and the deployment runbook.

This is a working document. Each finding has an owner-facing impact statement and a
status, so it can be used as the backlog for "what does a real class still need".

---

## How the audit was run

| Layer | What was exercised |
|---|---|
| Browser | Chrome via the in-app browser at a 375 px and desktop viewport, light and dark themes, logged in as admin, instructor and student |
| API | Every route in the README, plus negative cases (wrong role, bad enum, missing parameter, duplicate email, weak password, unknown path) |
| Database | Seeded demo data: 5 accounts, 1 published course, 6 nodes, 6 quizzes, 1 lesson video |
| Production | A second backend booted with `SPRING_PROFILES_ACTIVE=prod` on port 8092, real PostgreSQL, strict secrets |
| Quality gates | `mvn verify` against PostgreSQL, `npm test`, `npm run build`, Lighthouse on the landing page, GitHub Actions |

Demo accounts used: `admin@questlearn.dev`, `instructor@questlearn.dev`,
`student@questlearn.dev` — all with `password123`.

At the time of the audit: 32 API routes, 89 backend tests (11 of them PostgreSQL
integration tests), 22 frontend tests, and CI green on both halves.

After the hardening release described below: the same routes plus
`GET /admin/audit`, 94 backend tests (16 PostgreSQL integration tests), and 24
frontend tests across 5 files.

After the enrollment release (also 13 November 2026): 47 API routes, 119 backend
tests (41 of them PostgreSQL integration tests), and 31 frontend tests across 6 files,
plus a Playwright smoke suite. Enrollment, a catalogue vs. "my courses" split,
per-course rosters, a CSV export, per-learner attempt history, a course-scoped
leaderboard and self-service password recovery are all live and covered by tests.

---

## Scorecard

| Area | Score | Basis |
|---|---|---|
| Visual design and polish | 9/10 | Coherent cream/orange system, display type, empty and error states designed |
| Accessibility | 9/10 | Lighthouse 100 / 100 / 100 on the landing page (a11y, best practices, SEO); visible focus rings; reduced-motion support |
| Student learning flow | 8/10 | Skill tree → lesson → quiz → viva, with XP and a progress page that reads well |
| Instructor authoring | 8/10 | Five-step studio, AI draft builder, quiz and video editors |
| Admin and account management | 8/10 | Moderation, account search, the audit feed and course rosters work; no pagination |
| Authentication and security | 8/10 | Role enforcement, throttling and revocable sessions; no email verification |
| Classroom operations | 7/10 | Enrollment, cohorts with join codes, rosters, per-learner history, CSV export and a class leaderboard; no gating or deadlines |
| Reliability and observability | 5/10 | Health endpoint only; no metrics, tracing or error aggregation |
| Tests and CI | 8/10 | Real PostgreSQL in CI, guards against silently skipped tests, both halves gated |
| Deployment and documentation | 8/10 | `DEPLOY.md` covers TLS, backups, upgrades and known limits |
| Responsive and mobile | 8/10 | Verified at 375 px; no horizontal scroll or clipped controls |

**Overall: about 8/10 as a single-class pilot, about 6/10 as a school-wide system.**
The classroom layer now exists (join by code, class, roster, report, per-learner
history, class board); what is still missing is the institution above it - course
gating, email and deadlines.

---

## What the product is genuinely good at

- **The learning loop is complete and honest.** Nodes unlock in order, XP is shown
  before a node starts, quizzes are graded on the server, and the module-detail
  response provably never ships `correctIndex` or `explanation` (a regression test
  asserts exactly that).
- **Role separation is enforced in the backend, not only in the router.** Student →
  `/admin/stats`, instructor → `/admin/users`, student → `POST /courses` all return
  403 with a JSON body. An admin cannot demote themselves server-side.
- **Error handling is disciplined.** 409 on duplicate email, 400 with per-field
  messages on validation, 404 on unknown paths, 400 on a bad enum value, and a clear
  refusal to delete a published course or one with student progress.
- **Authoring is fast enough that a teacher would use it.** One request generates a
  multi-node draft with lessons, takeaways, quizzes and a viva; the draft lands
  unpublished, and the AI quota service caps spend.
- **Operational maturity above the norm for a student project.** Flyway migrations,
  PostgreSQL in CI, a CI guard that fails if the integration suite silently skips,
  systemd + nginx + certbot runbook, a production profile that refuses to boot
  without `JWT_SECRET` and `CORS_ORIGINS`, and login throttling at both the app
  (15-minute lockout) and nginx (10 requests/minute) layers.

---

## Findings fixed during the audit

| # | Severity | Finding | Fix | Where |
|---|---|---|---|---|
| 1 | High | `PATCH /courses/{id}/publish` without `?published=` returned **500** and logged a stack trace | 400 with `Required parameter 'published' is missing`, plus a regression test | `826502d` |
| 2 | High | The production profile still published the full OpenAPI schema and Swagger UI, contradicting the deploy checklist | Both disabled in `application-prod.properties`; verified 404 on a real `prod` boot | `826502d` |
| 3 | Medium | Subtle text measured **4.02:1** on cream (AA needs 4.5:1) | Tokens raised to 4.99:1 light / 4.72:1 dark; Lighthouse back to 100 | `826502d` |
| 4 | Low | `/robots.txt` fell through to `index.html` | Real `robots.txt` that keeps signed-in workspaces out of search | `826502d` |
| 5 | CI | The PostgreSQL guard asserted exactly 10 tests, so adding an eleventh failed a green run | Guard now asserts a floor of 10 and zero skipped | `91d39f5` |
| 6 | High | Sessions could not be revoked: a password reset or a stolen token stayed valid for 24 hours | `tokenVersion` claim checked against the database on every request; password change and admin reset invalidate every other session | `b4e0576` |
| 7 | Medium | A role change did not take effect until the user signed in again | The filter now reads the role from the database, so demotion is immediate | `b4e0576` |
| 8 | Medium | `PATCH /auth/password` existed but was unreachable from the UI | Change-password dialog in the account menu; the endpoint returns a fresh token | `b4e0576` |
| 9 | Medium | No record of who changed a role, reset a password, or unpublished a course | Append-only `admin_audit_log`, written inside the same transaction as the action, shown on the admin page | `b4e0576` |
| 10 | Medium | Admin could only scroll a flat list of every account | Case-insensitive server-side search by name or email on `/admin/users?query=` | `b4e0576` |
| 11 | Low | Minimum password length was 6 | Raised to 8 on registration and password change | `b4e0576` |

### How the hardening release was verified

- **Live browser session, signed in as admin:** the audit feed showed a publish
  and an unpublish performed seconds earlier; the account search filtered the
  roster to one row for `sam` and restored all five when cleared; the
  change-password dialog opened centred, rejected a mismatched confirmation, and
  reached its success state without signing the admin out.
- **Live password rotation:** the admin password was rotated to a temporary value
  and back through the dialog. The pre-rotation token returned **401** on
  `/auth/me`, the returned token returned **200**, and the temporary password was
  rejected once it had been changed back.
- **Suites:** `mvn -B verify` 94 tests / 16 integration, `npm test` 24 tests
  across 5 files, `npm run build` clean.
- **Schema:** Flyway applied `V4` and `V5` on the existing dev database with no
  manual step, and Hibernate's `validate` passed, so the migrations match the
  entities.

---

## Open findings

### P0 — blocks a real term

**1. Per-class competition and administration — CLOSED.**
This item is now substantially closed. A teacher can create a class with a join
code, mark the course **members only** so it leaves the catalogue until a code adds
a student, narrow the roster (and therefore the CSV) to one class, open any
learner's attempt trail, rank the course on its own board, **rank a single class** on
that board, and **enrol a pasted class list** (CSV or a column of addresses) with
unknown addresses reported back rather than silently created. Nothing in this
finding is still open.

**2. Email delivery — password recovery CLOSED, notifications still open.**
Self-service recovery now exists: a token table, a 30-minute expiry, single use
enforced by a conditional claim, superseded links, hashed storage, per-address
throttling and session revocation on redemption. Mail itself is still opt-in: with
`MAIL_HOST` blank the link goes to the server log instead of an inbox, so address
verification and lesson notifications remain open, and a delivery failure is only
visible in the log rather than an outbox. *Fix shape:* point `MAIL_HOST` at an SMTP
or transactional-email provider, then reuse the same mailer for verification and
notifications.

**3. Class reporting: acting on the data — CLOSED.**
The roster lists every enrolled learner with their per-node status, attempts, XP and
last activity; each name opens their full attempt trail; the CSV exports the same grid
for a gradebook. It can now also be narrowed to **one node, cleared or not**, which is
the "who is stuck on node 3" question, and printed: a print stylesheet drops the
navigation and buttons and keeps the rows. Class lists import, so the whole loop runs
inside the product. **Three of the four P0 findings are now closed; the open one is
email.**

### P1 — needed in the first month of use

4. **No deadlines, assignments or notifications.** The path is self-paced only; there
   is no way to say "due Friday" or to nudge a student who has stalled.
5. **Media lives on one server's disk.** Backups must include `uploads/videos`
   (documented), but there is no object storage, CDN or transcoding, and a 100 MB
   phone video is hostile to a slow connection.
6. **Dependency advisories.** `npm audit` reports 2 critical, 1 high and 5 moderate,
   all in the Vite/Vitest/react-router toolchain and all requiring major upgrades
   (Vite 8, Vitest 5, react-router 7).
7. **`/admin/users` pagination — CLOSED.** The list takes `page` and `size`
   (default 25, capped at 100) and returns `users`, `total`, `page`, `size` and
   `totalPages`, so the page can say "26–50 of 2,000" and a request cannot ask for
   the whole school. Account search pages the same way.
8. **CSP and HSTS — CLOSED.** `deploy/security-headers.conf` carries a policy
   written for this app (no font CDN, YouTube allowed in a frame, `blob:` for the
   recorder), plus HSTS, `nosniff`, `SAMEORIGIN`, a referrer policy and a
   permissions policy. `deploy/nginx.conf` includes it, and the TLS block certbot
   writes must include the same file. The one deliberate weakness left: `script-src`
   needs `'unsafe-inline'` for the inline theme bootstrap — moving that to a hashed
   file is the follow-up. While doing this, the Google Fonts `<link>` that had crept
   into `index.html` was removed: the README already promised system fonts, and the
   CDN request both contradicted it and would have forced a looser policy.
9. **No email verification** means an account can be created with someone else's
   address by anyone holding the institution code.

### P2 — later

10. Certificates of completion, CSV import of students, SSO/LTI, i18n, teacher
    analytics dashboards, Playwright end-to-end tests, load testing, richer metrics
    (`/actuator/health` is the only exposed actuator endpoint), an accessibility
    statement page, and a documented data-retention policy.
11. **Admin progress reset — CLOSED.** `DELETE /admin/users/{userId}/modules/{moduleId}/progress`
    now has a Reset button on each node of a learner's detail page, and it is open to
    the course's own instructor as well as admins (the service refuses any course the
    teacher does not own). The node returns to its starting state and the XP it earned
    is taken back.

---

## Roadmap

Items 1 and 3 of the previous roadmap are shipped (see "The enrollment release"
below), so the order starts from what a graded term still needs.

| Order | Work | Effort | Why first |
|---|---|---|---|
| 1 | Email transport: verification + self-service reset | 3–5 days | The only P0 left, and the most embarrassing support path |
| 2 | Deadlines and notifications | 1–2 weeks | Turns self-paced study into schedulable coursework |
| 3 | Object storage for lesson video | 3–5 days | Protects the single server and slow connections |
| 4 | Dependency majors (Vite 8, Vitest 5, react-router 7) | 2–4 days | Clears two critical advisories; needs its own quiet week |

### The enrollment release (13 November 2026)

| Commit | What it added | How it was verified |
|---|---|---|
| `df687bf` | `enrollments` table with V6 backfill, `GET /courses/mine`, `POST`/`DELETE /courses/{id}/enroll`, `enrolled` and `enrolledCount` on every course | 3 integration tests (idempotent join, roster count, refusals); live join → leave → re-join round trip in the browser |
| `5bb8a53` | Roster count on each instructor course card | Live: `6 nodes · 4 learners joined` |
| `df643b7` | `GET /courses/{id}/roster`: every learner with per-node status, XP, streak, enrolled and last-activity dates | 2 integration tests; live against the demo course |
| `a5bf9f3` | CSV export of the roster, one column per node, BOM for Excel | 7 unit tests on the builder; live blob captured from the button |
| `3bc1b2b` | `GET /courses/{id}/roster/{userId}`: per-learner attempt trail, 404 for anyone not on that roster, 403 for students | Integration test covering the trail, the 404 and the 403; live page reviewed |
| `76a253d` | `GET /courses/{id}/leaderboard`: class ranking by XP earned inside one course, plus a scope picker on the leaderboard page | Integration test (rank, course XP, modules cleared, draft 403); live scope switch on the page |
| `c40bcb5` | Cohorts (V7): create/list/delete a class, eight-character join codes without ambiguous characters, and `POST /cohorts/join` which enrolls and joins in one step | 2 integration tests (code join, idempotency, case-insensitivity, 404, role refusals, delete keeps enrollment); live: instructor created "10B Demo", the student joined with a lower-case code, roster showed 1 member, deleting the class left Leo enrolled |
| `_pending_` | Audit pass over the above: roster import now refuses an empty list and caps at 500 addresses instead of returning a silent 200 or holding a transaction across ten thousand lookups; the dead `roster` and `courseLeaderboard` overloads (which would have bypassed `@Transactional` through self-invocation) are gone, along with two unused repository finders; the import panel no longer prints | 1 new integration test (empty object, blank strings, 501 addresses all 400, a normal import still 200); live regression sweep: gating hides course 18 from an unenrolled learner and 403s the direct link, a class round-trip filters roster, board and node filter and leaves progress intact on delete (2/6, 420 XP) |
| `c4fec20` | Progress reset in the UI: a Reset button on each touched node of a learner's detail page, and the existing endpoint opened to the owning instructor (ownership checked in the service) | 1 integration test (teacher resets a cleared node, XP returns to 0, node back to UNLOCKED with no attempts, student refused); live: Leo's two cleared nodes show Reset, the four untouched ones do not |
| `b587165` | Admin pagination (page/size, total and totalPages, size capped at 100, pager in the admin table) and edge hardening: `deploy/security-headers.conf` with CSP/HSTS/permissions policy included from `nginx.conf`, and the Google Fonts CDN removed so `font-src` can stay `'self'` | 1 integration test (page 0 and 1 of 3 accounts, clamped size, unchanged search shape); live: admin table showed "1–5 of 5" with both pager buttons disabled, network had no font request, and the heading computed to the system stack |
| Password recovery | `password_reset_tokens` (V9) plus `POST /auth/password-reset/request` and `/confirm`, a mailer that falls back to the server log when `MAIL_HOST` is blank, and `/forgot-password` + `/reset-password` pages with a link from sign-in. Tokens are stored as SHA-256 hashes, expire after 30 minutes, are claimed by a conditional UPDATE so they work once, and a redemption bumps `token_version` to sign other sessions out | 7 integration tests (hash-only storage and 30-minute window, unknown address gets the same 202 with no email, single use, expired refused, newer link supersedes the old, same-password rejected without burning the token, 4th request in an hour 429); live: registered a throwaway account, pulled its link from the log, set a new password through the browser page, then new password 200 / old password 401 / replay 400 |
| Playwright smoke suite | `questlearn-frontend/e2e/smoke.spec.js` runs two journeys. Open course: a brand-new account joins from the catalogue, clears *HTML Foundations* through the quiz UI, and the instructor reads that learner off the roster at 1/6 cleared. Members-only: the instructor gates the second seeded course and creates a class, the student cannot find the course or open its direct link, then joins with the class code and reaches the skill tree; cleanup restores the course and deletes the class even on failure. Runs against the live API, with the frontend dev server started by the config | Both passing locally in ~25s (headless Chromium, `npm run test:e2e`); its own `e2e` CI job builds the jar, starts it on :8091 against a throwaway PostgreSQL database, and uploads the report plus API log if it fails |
| `e10bdfa` | Roster import + node filter + print: `POST /courses/{id}/roster/import` (addresses only, duplicates collapsed, unknown accounts reported), `?nodeId=&nodeCleared=` on the roster, `nodes` on the roster payload so the picker survives an empty result, and a print stylesheet | 2 integration tests (import idempotency, case-folded duplicates, unknown address, student refused; node filter cleared/not-cleared and a foreign node 404); live: import via the UI reported 1 enrolled and 1 unknown, repeat returned "already in", node filter narrowed to Leo then emptied the list with the picker still present |
| `55b4b6c` | Demo data: a second course, "Data Structures Detour" (3 nodes, a quiz on the last), with two nodes cleared for the demo student, an enrollment row and an account total recomputed from the work; written to apply to an existing database, not just a fresh one | 107 tests still pass (the seeder is excluded from the `it` profile); live: Leo 420 XP across 2 courses, level 3, `mine` shows 2/6 and 2/3, per-course board 200 XP and the combined board 420 |
| `df5e268` | Overall board: `GET /leaderboard/overall` sums the XP of every cleared node across every course per learner, with a node count, a course count and the top three contributing courses; the standings page opens on it ("All courses combined") and keeps lifetime XP as a second option | 1 integration test (combined 100 from one node, one course, the course named, teacher refused); live: Mira 520/4 nodes, Leo 220/2, Sam 100/1, each attributed to the one course |
| `97fea6d` | Class board: `?cohortId=` on `/courses/{id}/leaderboard`, the board opens to the owning instructor, and the standings page gains a class picker under the course one | 1 integration test (whole course 2 → one class 1, rank restarts at 1, unknown class 404, teacher may read own board); live: instructor's board auto-opened on their course, picking "10B Board" left Leo alone on it |
| `09f4b4c` | Course gating (V8 `membership_required`): a members-only course leaves the catalogue and refuses non-members, while a class code still works; plus `?cohortId=` on the roster and the class picker, and a members-only switch on the classes page | 2 integration tests (gated course hidden + 403 + code still joins + owner-only toggle; roster narrowing 2 → 1 and a foreign class 404); live: switch on → "Members only", switch off restored, roster picker 4 → 1 learner |

---

## Re-running the audit

```bash
# Backend, including the PostgreSQL suite
cd questlearn-backend
IT_DB_URL=jdbc:postgresql://localhost:5432/questlearn_it \
IT_DB_USER=postgres IT_DB_PASSWORD=... mvn -B verify

# Frontend
cd questlearn-frontend && npm test && npm run build

# Browser smoke suite, with the backend already running on :8091
cd questlearn-frontend && npm run test:e2e

# Production profile smoke test
SPRING_PROFILES_ACTIVE=prod JWT_SECRET=... CORS_ORIGINS=https://example.com \
  mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8092
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8092/v3/api-docs   # 404
curl -s http://localhost:8092/api/v1/courses                                  # 401 JSON
```

Lighthouse was run through the in-app browser against `http://localhost:5173/`.

---

## Verdict

For a pilot with one teacher and one class, onboarded by hand, this is ready now: it is
more polished, more accessible and better tested than the average internal LMS, and its
failure modes are contained. A teacher can now run a class inside the product - students
join, the roster shows who is stuck, a click shows why, and the CSV lands in a
gradebook - and can rank that class on its own board.

For a department running a graded term, two things still block it: without email there
is no self-service reset or address verification, and without cohorts a course is a
public listing rather than a class. Ship roadmap items 1 and 2 first; neither is large,
and between them they turn this from a good pilot into something a school can operate.
