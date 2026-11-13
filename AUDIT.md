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

---

## Scorecard

| Area | Score | Basis |
|---|---|---|
| Visual design and polish | 9/10 | Coherent cream/orange system, display type, empty and error states designed |
| Accessibility | 9/10 | Lighthouse 100 / 100 / 100 on the landing page (a11y, best practices, SEO); visible focus rings; reduced-motion support |
| Student learning flow | 8/10 | Skill tree → lesson → quiz → viva, with XP and a progress page that reads well |
| Instructor authoring | 8/10 | Five-step studio, AI draft builder, quiz and video editors |
| Admin and account management | 7/10 | Moderation, search and an audit feed work; rosters still missing |
| Authentication and security | 8/10 | Role enforcement, throttling and revocable sessions; no email verification |
| Classroom operations | 2/10 | No enrollment, cohorts, deadlines or gradebook export |
| Reliability and observability | 5/10 | Health endpoint only; no metrics, tracing or error aggregation |
| Tests and CI | 8/10 | Real PostgreSQL in CI, guards against silently skipped tests, both halves gated |
| Deployment and documentation | 8/10 | `DEPLOY.md` covers TLS, backups, upgrades and known limits |
| Responsive and mobile | 8/10 | Verified at 375 px; no horizontal scroll or clipped controls |

**Overall: about 7/10 as a single-class pilot, about 4/10 as a school-wide system.**
The craft is high; the operations layer is what is missing.

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

**1. No enrollment or cohort model.**
Every published course is visible to every student, and the leaderboard is global.
A teacher cannot roster a class, cannot see "my students", and cannot stop one
cohort from seeing another cohort's course.
*Fix shape:* `enrollments(user_id, course_id, enrolled_at)`, join codes per course or
cohort, catalogue vs. "my courses" split, leaderboard scoped by course or class.
Backfill from `user_module_progress` during the migration.

**2. No email transport at all.**
Consequences: no address verification, no self-service password recovery, no
notifications. The only reset path is an admin reading a temporary password aloud.
*Fix shape:* an SMTP or transactional-email provider, a verification token table, a
reset-token flow with single use and expiry, and a mail outbox so delivery failures
are visible.

**3. No class-level reporting or gradebook export.**
Per-student progress is good. A teacher needs "who in 10B has not finished node 3"
and a CSV for the school's gradebook.
*Fix shape:* a roster view per course with last activity, node status and quiz
scores; `GET /courses/{id}/report.csv`; a printable summary.

### P1 — needed in the first month of use

4. **No deadlines, assignments or notifications.** The path is self-paced only; there
   is no way to say "due Friday" or to nudge a student who has stalled.
5. **Media lives on one server's disk.** Backups must include `uploads/videos`
   (documented), but there is no object storage, CDN or transcoding, and a 100 MB
   phone video is hostile to a slow connection.
6. **Dependency advisories.** `npm audit` reports 2 critical, 1 high and 5 moderate,
   all in the Vite/Vitest/react-router toolchain and all requiring major upgrades
   (Vite 8, Vitest 5, react-router 7).
7. **No pagination on `/admin/users`.** Search now exists; a 2,000-account school
   still receives every row in one response.
8. **Production nginx sends no CSP or HSTS.** Certbot may add HSTS when it rewrites
   the file; CSP does not come for free and needs a policy that allows the theme
   bootstrap script.
9. **No email verification** means an account can be created with someone else's
   address by anyone holding the institution code.

### P2 — later

10. Certificates of completion, CSV import of students, SSO/LTI, i18n, teacher
    analytics dashboards, Playwright end-to-end tests, load testing, richer metrics
    (`/actuator/health` is the only exposed actuator endpoint), an accessibility
    statement page, and a documented data-retention policy.
11. **Admin progress reset** exists in the API (`DELETE /admin/users/{userId}/modules/{moduleId}/progress`)
    but has no UI. It is the right tool for "let me retry that quiz" support tickets.

---

## Roadmap

| Order | Work | Effort | Why first |
|---|---|---|---|
| 1 | Enrollment/cohorts + scoped leaderboard + rosters | 2–3 weeks | Without it this is a public catalogue, not a classroom |
| 2 | Email transport: verification + self-service reset | 3–5 days | Removes the most embarrassing support path |
| 3 | Teacher gradebook view + CSV export | 1 week | The screen teachers open every week |
| 4 | Deadlines and notifications | 1–2 weeks | Turns self-paced study into schedulable coursework |
| 5 | Object storage for lesson video | 3–5 days | Protects the single server and slow connections |
| 6 | Dependency majors + CSP | 3–5 days | Clears two critical advisories; hardens the edge |
| 7 | `/admin/users` pagination | 1 day | Prevents a bad day at 500 accounts |
| 8 | E2E smoke suite (signup → enroll → complete → report) | 3–5 days | Catches wiring regressions the unit tests cannot |
| 9 | Admin progress-reset UI | Half a day | Closes a support workflow that already exists in the API |

---

## Re-running the audit

```bash
# Backend, including the PostgreSQL suite
cd questlearn-backend
IT_DB_URL=jdbc:postgresql://localhost:5432/questlearn_it \
IT_DB_USER=postgres IT_DB_PASSWORD=... mvn -B verify

# Frontend
cd questlearn-frontend && npm test && npm run build

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
failure modes are contained. For a department running a graded term, ship roadmap items
1–3 first — until enrollment exists, every student in the building can see every course,
and the leaderboard ranks people who have never met.
