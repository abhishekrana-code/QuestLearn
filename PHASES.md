# QuestLearn phase plan

**Status date:** 14 November 2026
**Source:** the older external audit that lists enrollment, email, reporting, password
UI, session revocation, audit logging, pagination and deadlines as missing, checked
line by line against this repository.

That audit is no longer current. Everything it lists as P0 or P1 has shipped since it
was written, with the exception of the two items under Phase 3 and Phase 5 here. What
follows is the work that is genuinely left, grouped into phases in the order they
should be built.

---

## What the pasted audit gets wrong today

| Claim | Reality |
|---|---|
| No enrollment or cohort model | `enrollments` (V6), `GET /courses/mine`, join/leave, cohorts with join codes (V7), roster scoping. Commits `df687bf`, `c40bcb5`, `dfb`-series |
| No email at all | Resend, SMTP and log transports selected by `EMAIL_PROVIDER`; verification and recovery share one `MailService`. `ead6e99` |
| No class reporting or export | Roster per node, per-learner attempt trail, CSV with BOM, print stylesheet, pasted class-list import. `df643b7`, `a5bf9f3`, `e10bdfa` |
| Password change has no UI | `ChangePasswordDialog` in the account menu, fresh token on success. `b4e0576` |
| No session revocation | `tokenVersion` claim checked against the database on every request; password change and admin reset revoke. `b4e0576` |
| No audit log | `admin_audit_log`, written in the same transaction as the action, shown on the admin page. `b4e0576` |
| No `/admin/users` pagination or search | `page`/`size` capped at 100 plus server-side search. `b587165` |
| No deadlines or notifications | V11 deadlines, five states, advisory only, one opt-out digest per learner per day |
| No CSP or HSTS | `deploy/security-headers.conf`, included from `nginx.conf`. `b587165` |
| Only `/actuator/health` exposed | Metrics exposed to admins, request ids, error ledger, telemetry view. `a122974` |
| Password policy is 6 characters | 8 on registration and change. `b4e0576` |

Still accurate: media lives on one server's disk, and the npm advisories need major
upgrades. Those are Phase 3 and Phase 5 below.

---

## Phase 1: Accessibility and data-policy closure (done, `97ce54d`)

**Why:** the audit asks for an accessibility statement and a documented retention
policy; neither exists. A skip link is also missing, and the landing page nests a
`<main>` inside the app's own landmark.

**Scope**

- Skip-to-content link in the app shell, visible on keyboard focus, moving focus into
  the `<main id="main-content">` landmark.
- One `<main>` per page: the landing page's inner landmark becomes a plain container.
- `/accessibility` statement page: conformance target, what is verified, known gaps,
  and how to report a problem.
- A linked route to it from the landing footer.
- A data-retention section in `DEPLOY.md` covering tokens, the audit log, reminder
  ledger, error buffer and application logs.

**Done when:** keyboard `Tab` from the top of any page reaches a visible "Skip to
content" control; a single `main` landmark exists; `/accessibility` renders and is
reachable from the footer; the retention table is in `DEPLOY.md`; build and unit tests
pass.

## Phase 2: Per-class deadline overrides (done, uncommitted)

**Why:** the current audit lists it as the one gap in classroom operations. A deadline
belonged to a node and applied to every class taking the course.

**Built:** `V12__cohort_deadlines.sql` and `CohortDeadline`, resolved through one
`EffectiveDeadlines` component that the dashboard, the skill tree, the node briefing and
the digest all share. A learner in two classes of one course gets the earlier override.
Instructor endpoints under `/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline`,
plus a collapsed **Class due dates** editor on the classes page.

**Verified:** `EffectiveDeadlinesTest` (6 tests: fallback, override wins, only own
classes, earlier date wins, no class, empty course list) and a 14-step live run against
the API: node date → learner outside the class unaffected → join → override wins on the
dashboard, skill tree and briefing → class lists its override → a learner gets 403 →
clearing falls back to the node date → seeded state restored.

## Phase 3: Object storage for lesson video (done, uncommitted)

**Why:** uploads sit on the application server's disk; a backup must copy them and a
second app server cannot serve them.
**Scope:** a storage interface behind `MediaStorageService` with the local disk as the
default and an S3-compatible driver (R2/S3/MinIO) selected by configuration; signed or
proxied playback; migration note for existing files; tests against a local stub.
**Built:** a `MediaStore` interface with a disk driver (default, no account) and an
S3 driver for AWS S3, Cloudflare R2 and MinIO, chosen by `MEDIA_STORAGE`. Uploads are
signed in both modes: a presigned PUT to the bucket, or a signed one-shot URL on disk
(`/api/v1/media/uploads/{name}`). Playback keeps one stable path,
`/api/v1/media/videos/{name}`: the disk resource handler with Range support, or a
redirect to a short-lived signed GET on a bucket. A bucket deployment is checked at
startup. The studio asks for a ticket, uploads the bytes itself, then records the
object, so a 100 MB lesson never passes through the API.

**Verified:** `MediaStorageServiceTest` (8) and `MediaStoreConfigTest` (4), a 12-step
live run on disk (ticket, signed upload, attach, playback, video content type, Range
206, forged signature 403, missing object 400, learner 403, cleanup), a startup with
`s3` and no bucket exits 1 naming `MEDIA_S3_BUCKET`, and the seeded demo lesson still
plays. Not verified: a real bucket, since no account is configured here.

## Phase 4: Teacher analytics (done, uncommitted)

**Why:** the roster answers "who is stuck now"; the studio cannot answer "where do
people stop".
**Built:** `GET /courses/{id}/analytics` (owner or admin, optional `cohortId`) returns
learners, started, finished, a per-node funnel (reached, started, cleared, attempts,
median hours from first attempt to completion) and the node with the biggest
reached-minus-cleared gap. The studio page at `/studio/courses/{courseId}/analytics`
shows the bars, a class picker and the drop-off callout, linked from the roster and
class pages.

**Verified:** `AnalyticsServiceTest` (6: funnel counts, drop-off choice, median from
first attempt, class scope, empty class, even-count median) and a 14-step live run
(titled response, consistent counts, drop-off inside the node list, cleared count
cross-checked against the roster, learner 403, class scope of one learner, unknown
course 404, test class cleaned up).

## Phase 5: Dependency majors and CSP tightening

**Why:** `npm audit` reports 2 critical, 1 high and 5 moderate, all fixed only by major
upgrades: Vite 8, Vitest 5, react-router 7. The inline theme bootstrap is the reason
`script-src` needs `'unsafe-inline'`.
**Scope:** upgrade the three toolchain majors, replace the inline theme script with a
hashed one, drop `'unsafe-inline'` from `script-src`, re-run the audit and the Playwright
suite. Needs a quiet window: it touches every build.

## Phase 6: Later, deliberately not scheduled

Certificates of completion, SSO/LTI, i18n, load testing, per-lesson notification
digests, and a third-party accessibility audit.
