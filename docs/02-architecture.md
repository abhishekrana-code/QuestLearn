# 2. Architecture

## 2.1 System shape

```
┌──────────────────────────────── browser ────────────────────────────────┐
│  React 18 bundle (Vite build)                                           │
│  ├─ React Router routes + role guards                                   │
│  ├─ AuthContext (token, user, boot)                                     │
│  ├─ GamificationContext (XP bar, level-up modal, bursts)                │
│  └─ axios instance: baseURL /api/v1, bearer token, 401 event            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS (public) or same-origin /api
┌───────────────────────────────▼─────────────────────────────────────────┐
│  Static host / proxy                                                     │
│  dev:  Vite :5173  (proxy /api → :8091)                                  │
│  demo: Vite preview :5180 (proxy /api → :8091) behind Tailscale Funnel   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ /api/v1/**
┌───────────────────────────────▼─────────────────────────────────────────┐
│  Spring Boot 3.4.5 on Java 21                                            │
│  RequestTraceFilter → JWT filter → authorization → controller            │
│  → service (rules, transactions) → repository (Spring Data JPA)          │
│  → PostgreSQL 16 (Flyway-managed schema)                                 │
│                                                                         │
│  scheduled: DeadlineReminderJob (opt-in)                                 │
│  optional: SMTP / Resend, Groq, S3                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

There is no separate API gateway, message broker or cache tier. The backend is one
process and one database; the frontend is static files. That is deliberate: the
project targets a laptop with 8 GB of RAM, and every extra moving part would cost
more than it returns at this scale.

## 2.2 Repository boundaries

| Area | Directory | Rule |
| --- | --- | --- |
| HTTP surface | `controller/` | Parse and validate input, delegate, choose status codes. No business rules. |
| Business rules | `service/` | Authorization that depends on data, transactions, XP, deadlines, AI, media rules. |
| Persistence | `repository/` | Spring Data derived queries only; no hand-written SQL except a few `@Query` claim/count helpers. |
| Wire shapes | `dto/` | Immutable records. Entities never leave the service layer. |
| Persistence shapes | `model/` | JPA entities and enums. |
| Cross-cutting | `config/`, `security/`, `exception/`, `email/`, `mapper/`, `util/` | Wiring, filters, error translation, delivery adapters. |
| UI screens | `frontend/src/pages/` | One file per route. |
| Reusable UI | `frontend/src/components/` | No page-level data fetching. |
| Client-side domain | `frontend/src/services/` | HTTP calls and pure transforms. |
| Shared state | `frontend/src/context/` | Session, gamification, theme. |

The dependency direction is one-way: controllers → services → repositories. A
repository never calls a service; a service never imports a controller; a DTO never
imports an entity.

## 2.3 Request lifecycle

1. **Trace** — `RequestTraceFilter` accepts an `X-Request-Id` or mints a UUID, puts it
   in the MDC (so every log line carries it), and echoes it on the response.
2. **Authentication** — `JwtAuthenticationFilter` reads `Authorization: Bearer …`,
   parses claims, loads the user, checks the token version, and installs an
   `AppUserPrincipal(id, email, role)` in the security context. A stale token version
   (password change, forced logout) is rejected here.
3. **Authorization** — URL rules in `SecurityConfig` decide what is public; method
   annotations (`@PreAuthorize`) decide role boundaries. Ownership checks happen in
   services (`CourseService.assertCanManage`, `assertCanView`).
4. **Validation** — `@Valid` on request records produces field-level 400s through
   `GlobalExceptionHandler`.
5. **Business transaction** — the service method runs in one transaction. Anything
   that must be atomic (complete a node, import a roster, delete an account) is a
   single service call.
6. **Mapping** — the service returns a DTO record; Jackson writes it with
   `non_null` inclusion, so absent optional fields disappear instead of becoming
   `null`.
7. **Errors** — `ApiException` and `GroqAiException` become JSON bodies with `status`,
   `message`, `path` and `requestId`. Unexpected exceptions become a 500 with the same
   shape and are recorded by `ErrorLogService` for the admin telemetry view.
8. **Metrics** — Micrometer times the request under `http.server.requests`;
   `TelemetryService` later merges the per-URI timers for the admin console.

## 2.4 Startup sequence

```
main()
 └─ Spring context
     ├─ Flyway migrates/validates the schema (V1–V14)
     ├─ JPA validates entities against the schema (ddl-auto=validate)
     ├─ DataInitializer (ApplicationRunner)
     │    ├─ demo password resolved (configured, or generated once)
     │    ├─ seed users, courses, modules, quizzes, attempts, demo video
     │    └─ sync demo password hashes when it changed
     └─ BootstrapAdminRunner (ApplicationRunner)
          └─ optional first admin from BOOTSTRAP_ADMIN_* when no admin exists
```

`DataInitializer` is idempotent: it seeds only when the marker data is absent, and it
backfills demo attempts/videos for databases created by earlier versions. It never
overwrites a learner's real progress.

## 2.5 Data model

Fourteen migrations build the schema. Entity relationships:

```
users 1 ──< enrollments >── 1 courses
users 1 ──< user_module_progress >── 1 modules
users 1 ──< module_attempts >── 1 modules
courses 1 ──< modules 1 ──< modules (parent_module_id, self-reference)
modules 1 ──1 quizzes
courses 1 ──< cohorts 1 ──< cohort_memberships >── users
cohorts 1 ──< cohort_deadlines >── modules
modules 1 ──< deadline_reminders >── users
users 1 ──< password_reset_tokens
users 1 ──< email_verification_tokens
admin_audit_log (standalone, append-only)
demo_credential (single row, hashed shared demo password)
```

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `users` | Accounts | `role`, `total_xp`, `current_level`, `streak_days`, `last_activity_date`, `token_version`, `email_verified`, `notify_deadlines` |
| `courses` | Course metadata | `instructor_id`, `published`, `archived_at`, `membership_required`, `emoji` |
| `modules` | Skill-tree nodes | `course_id`, `parent_module_id`, `position_x/y`, `order_index`, `xp_reward`, `content` JSONB, `due_at` |
| `quizzes` | One per node | `type`, `passing_score`, `payload` JSONB |
| `user_module_progress` | Per learner, per node | `status`, `score` (best), `attempts`, `completed_at` |
| `module_attempts` | Attempt history | `score`, `passed`, `source`, `created_at` |
| `enrollments` | Course membership | `user_id`, `course_id`, `enrolled_at` |
| `cohorts` | Classes | `course_id`, `name`, `join_code` (unique, case-insensitive lookup) |
| `cohort_memberships` | Class membership | `cohort_id`, `user_id` |
| `cohort_deadlines` | Class overrides | `cohort_id`, `module_id`, `due_at` |
| `deadline_reminders` | Sent-digest ledger | `user_id`, `module_id`, `kind`, `due_at`, `sent_at` |
| `password_reset_tokens` | Hashed reset tokens | `token_hash`, `expires_at`, `used_at` |
| `email_verification_tokens` | Hashed verify tokens | `token_hash`, `expires_at`, `used_at` |
| `admin_audit_log` | Who changed what | `actor_id`, `actor_email`, `action`, `target`, `detail` |
| `demo_credential` | Shared demo password | `password_hash`, `rotated_at`, `rotated_by` |

Key constraints worth knowing:

- `quizzes.module_id` is unique: a node has zero or one quiz.
- `users.email` is unique; lookups are case-insensitive via `lower(email)` semantics
  in the repository.
- `cohorts.join_code` is unique and looked up case-insensitively.
- Attempts are indexed on `(user_id, module_id, created_at)` for the history query.
- Audit rows are indexed on `created_at DESC` for the 50-row console.

## 2.6 Security model

### Authentication

- Stateless JWT, HS256, signed with `questlearn.jwt.secret`. Default lifetime 24 h.
- Claims include the user id (`sub`), email, role, and a `ver` token version.
- Passwords are BCrypt hashes. Nothing reversible is stored.
- Login is throttled per email: 5 failures lock for 15 minutes (both configurable).
- Password change increments `token_version`, revoking every other session; the
  caller receives a fresh token.

### Authorization

| Layer | Example |
| --- | --- |
| URL allowlist | register, login, reset request/confirm, email verify, Swagger, health, media playback, signed uploads. |
| Role annotation | `@PreAuthorize("hasRole('ADMIN')")` on account administration; `hasAnyRole('INSTRUCTOR','ADMIN')` on authoring, analytics, viva-free course edits. |
| Ownership | `assertCanManage` allows the course's instructor or any admin; `assertCanView` allows staff, enrolled students, or anyone when the course is published and open. |
| Object-level | Roster detail refuses a learner who is not enrolled; reset progress refuses modules outside the course. |

### Capability URLs

Two endpoints are intentionally public because the credential is in the URL:

- `GET /api/v1/media/videos/{name}`: a `<video src>` cannot send a bearer token. Names
  are random UUIDs, so possession of the URL is the capability.
- `PUT /api/v1/media/uploads/{name}`: a direct-to-disk/S3 upload carries `name`,
  `expires`, and an HMAC signature checked by `MediaStorageService`. The signature is
  the credential and expires after 15 minutes by default.

### Secrets

All secrets come from environment variables or a git-ignored `.env`; none are in the
repository. `application.properties` only names them. This documentation never
reproduces a secret value.

## 2.7 Consistency and concurrency

The deployment assumes **one backend instance**. Several guards are in-memory and
would need an external store before horizontal scaling:

| Guard | Where | Why it is in memory |
| --- | --- | --- |
| Login lockout | `LoginAttemptService` | Cheap, per-email; losing it on restart only shortens a lockout. |
| Password-reset and verification throttles | `PasswordResetService`, `EmailVerificationService` | Per-email rolling window; a restart resets the window. |
| AI hourly/daily quota | `AiQuotaService` | Must be fast and must not consume a DB connection per AI call. |
| Viva concurrency permit | `VivaService` | Bounds simultaneous expensive calls (default 4). |
| Recent server errors | `ErrorLogService` | Bounded ring buffer for the admin console. |

Database-level consistency is protected by transactions and unique constraints, not
by optimistic locking. Two simultaneous completions of the same node can both read
`UNLOCKED`; the second still awards XP only if its own read saw `UNLOCKED`. At
classroom scale this is acceptable, and the unique quiz/enrollment/cohort constraints
prevent the damaging duplicates (two quizzes on one node, two enrollments, two
classes with the same code).

## 2.8 Performance decisions

- **Lazy routes** — the skill tree, dashboards and studio are separate chunks, so the
  landing and sign-in pages stay small on a phone.
- **Batched counts** — course cards get enrollment counts with one grouped query, not
  one query per card (`CourseService.withEnrollmentContext`).
- **Precomputed summaries** — `user_module_progress` holds status, best score and
  attempt count, so the tree does not aggregate attempts per render.
- **Histogram merging** — telemetry merges Micrometer's per-URI timers instead of
  reading one arbitrary timer (see `TelemetryService`).
- **Small pool** — Hikari is capped at 5 connections and JPA batching is 20, which
  fits the 8 GB target.
- **No open session in view** — entities are mapped inside the transaction; the
  browser never triggers lazy loads.

## 2.9 Failure modes the design accepts

| Failure | Behaviour |
| --- | --- |
| Database down | Requests fail fast (10 s connection timeout); the health endpoint reports down; the static frontend still loads and shows errors with a retry banner. |
| Groq down or rate-limited | 502/429 with a human message; the quiz route still works. A `429` is surfaced as "examiner busy" with the two alternatives. |
| Mail provider down | The account action is still stored; delivery is retried a couple of times and then logged. Reset/verify links remain in the log for an operator. |
| Disk full | Upload fails with a clear 400/500; existing media keeps serving. |
| Restart | JWT sessions survive (stateless). In-memory throttles reset. Scheduled reminders resume; the ledger prevents duplicate sends. |
| Bad client clock | Deadlines are computed server-side from stored instants; the browser only formats. |

## 2.10 Configuration map

Environment variables override `application.properties`; names below are the
operator-facing switches. Secret values are intentionally omitted.

### Core

| Key | Default | Meaning |
| --- | --- | --- |
| `SERVER_PORT` | `8080` | API port (the local demo uses 8091). |
| `DB_URL` | `jdbc:postgresql://localhost:5432/questlearn` | JDBC URL. |
| `DB_USERNAME` / `DB_PASSWORD` | `postgres` / secret | Database credentials. |
| `JWT_SECRET` | secret | Signing key; must be long and private. |
| `JWT_EXPIRATION_MS` | `86400000` | Token lifetime (24 h). |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins. |
| `APP_BASE_URL` | `http://localhost:5173` | Base for links in emails. |

### Registration

| Key | Default | Meaning |
| --- | --- | --- |
| `INSTRUCTOR_INVITE_CODE` | empty | Required for instructor self-registration; empty disables it. |
| `STUDENT_INVITE_CODE` | empty | Optional institution code for students. |
| `REQUIRE_STUDENT_CODE` | `false` | If true and no code is configured, student sign-up fails closed. |

### Email

| Key | Default | Meaning |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `auto` | `auto` prefers Resend when a key exists, then SMTP, then log. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` | empty / 587 | SMTP settings. |
| `MAIL_FROM` | `no-reply@questlearn.dev` | Envelope sender. |
| `RESEND_API_KEY` | secret | Resend API key. |
| `RESET_MAX_PER_HOUR` | `3` | Per-email reset requests per rolling hour. |
| `VERIFICATION_MAX_PER_HOUR` | `3` | Per-email verification resends per hour. |

Token lifetimes are 30 minutes (reset) and 48 hours (verification).

### AI

| Key | Default | Meaning |
| --- | --- | --- |
| `GROQ_API_KEY` | secret, empty | Enables viva and AI authoring. |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint. |
| `GROQ_REASONING_MODEL` | `openai/gpt-oss-120b` | Grader / authoring model. |
| `GROQ_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Used when the primary is unavailable. |
| `GROQ_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | Speech-to-text. |
| `AI_DAILY_LIMIT` | `150` | Deployment-wide calls per day. |
| `AI_HOURLY_LIMIT` | `30` | Per-account calls per rolling hour. |
| `AI_MAX_CONCURRENT_VIVAS` | `4` | Simultaneous grading permits. |
| `AI_MAX_AUDIO_BYTES` | `26214400` | 25 MB audio cap. |

### Media

| Key | Default | Meaning |
| --- | --- | --- |
| `MEDIA_STORAGE` | `disk` | `disk` or `s3`. |
| `MEDIA_VIDEO_DIR` | `./uploads/videos` | Disk store directory. |
| `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ENDPOINT` | empty / `auto` | S3-compatible target. |
| `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` | secret | S3 credentials. |
| `MEDIA_S3_PATH_STYLE` | `false` | Needed by some S3-compatible providers. |
| `MEDIA_MAX_VIDEO_BYTES` | `104857600` | 100 MB application-level cap. |
| `MEDIA_MAX_UPLOAD`, `MEDIA_MAX_REQUEST` | `110MB`, `120MB` | Multipart limits. |
| `MEDIA_UPLOAD_TTL_MINUTES` | `15` | Signed upload validity. |
| `MEDIA_PLAYBACK_TTL_MINUTES` | `60` | Signed playback validity (S3). |

### Notifications

| Key | Default | Meaning |
| --- | --- | --- |
| `NOTIFICATIONS_ENABLED` | `false` | Turns the digest job on. |
| `NOTIFICATIONS_CRON` | `0 0 7 * * *` | Daily at 07:00 server time. |
| `NOTIFICATIONS_DUE_SOON_DAYS` | `7` | One window for every deadline display. |
| `NOTIFICATIONS_RETENTION_DAYS` | `120` | Ledger rows older than this are pruned. |

### Demo

| Key | Default | Meaning |
| --- | --- | --- |
| `DEMO_PASSWORD` | secret, empty | Shared password for seeded demo accounts. Empty on a fresh DB generates one and logs it once. |

A full operator checklist lives in
[07-operations-testing.md](07-operations-testing.md).
