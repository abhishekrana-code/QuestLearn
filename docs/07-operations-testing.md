# 7. Operations and testing

This page is for the person who has to keep QuestLearn answering: how the demo is
wired, how to run it from source, what each environment value changes, how a frontend
change reaches the public URL, how to test it, and what to check when it does not.

The commands are written for Windows PowerShell because that is how this deployment
runs. The Java and npm commands are the same on any platform.

## 7.1 What "running" means here

A working demo is four pieces:

| Piece | Address | Started by | Serves |
| --- | --- | --- | --- |
| PostgreSQL | `localhost:5432` (database `questlearn`) | the PostgreSQL service | all relational data, quiz JSONB, progress, tokens, audit rows |
| Backend jar | `http://localhost:8091` | `scripts/questlearn-up.ps1`, the watchdog, or a manual `java -jar` | `/api/v1/**`, `/actuator/**`, lesson video files |
| Frontend preview | `http://127.0.0.1:5180` | `npm run preview` | the built SPA in `questlearn-frontend/dist`, with `/api` proxied to 8091 |
| Tailscale Funnel | `https://questlearn.taileb48b2.ts.net` | `tailscale funnel --bg 5180` | the same preview, over HTTPS, publicly |

The public URL serves **the built frontend**, not the Vite dev server. That is
deliberate: no hot-reload websocket through the tunnel, no development overlay, and a
smaller payload. The preview server keeps the `/api` proxy, so one public port carries
the whole application.

`questlearn-frontend/dist` is read from disk on each request. Replacing the files is
enough to publish a frontend change; the preview process does not need to restart.
Restarting it is still useful when a build changed the process configuration, and
that is what `npm run publish` does.

**Git commits do not serve the site.** The running processes read the working tree
and the built `dist`. A commit or a push changes nothing at the public URL until the
corresponding process is rebuilt or restarted. This is also why a local fix can be
verified in the browser without committing it.

### The helpers that keep it up

| Script | What it does | When it runs |
| --- | --- | --- |
| `questlearn-up.ps1` | Starts the backend if health fails, holding the first start until Windows has finished booting (two quiet CPU samples, at most five minutes), builds `dist` only when it is missing, starts preview if 5180 is silent, starts the frontend watcher and the Java watcher if absent, then registers the Funnel with `tailscale funnel --bg 5180`. Safe to re-run. | The **QuestLearn demo** scheduled task, at sign-in. |
| `questlearn-publish.ps1` | Rebuilds the frontend (unless `-SkipBuild`), stops only the process that owns 5180, starts preview again, then checks that the public URL serves the bundle named in `dist/index.html`. | `npm run publish`, or manually. |
| `questlearn-watch-java.ps1` | Polls backend source timestamps; on a change it stops the JVM, packages the jar, restores the previous jar if the build fails, starts the new one and waits for health. | Started by `questlearn-up.ps1`; the demo process. |
| `questlearn-watchdog.ps1` | Polls `/actuator/health` every 30 s; after 2 minutes unhealthy it stops whatever owns 8091, starts the jar, waits up to 8 minutes for it (a start during Windows boot was measured at 245 s), and emails one alert per outage. | The **QuestLearn watchdog** task, at startup, as `SYSTEM`. |
| `questlearn-backup.ps1` | Dumps the database in custom format, zips `questlearn-backend/uploads`, writes a manifest, and keeps the newest 7 runs. | The **QuestLearn backup** task, daily at 02:30, as `SYSTEM`. |
| `questlearn-restore.ps1` | Stops the backend, restores the dump with `--clean --if-exists`, replaces the uploads folder, starts the backend and waits for health. | Manually, during recovery. |
| `questlearn-verify-backup.ps1` | Restores the newest backup into a scratch database, checks schema version and row floors, compares the uploads archive with the manifest, drops the scratch database, and alerts on failure. | The **QuestLearn backup check** task, Sunday at 03:30. |
| `questlearn-notify.ps1` | Sends one operational alert through Resend or SMTP, using the same credentials as the app. | Called by the watchdog and the backup check. |

All PowerShell helpers dot-source `questlearn-common.ps1`, which owns the heap flags
(`-Xms256m -Xmx768m`), port ownership, health checks, the dotenv reader and the
cmd-wrapper that keeps native-tool stderr from terminating PowerShell.

### Scheduled tasks

Register them once from an elevated PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-logon-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-watchdog-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-check-task.ps1
```

| Task | Trigger | Identity | Why that identity |
| --- | --- | --- | --- |
| QuestLearn demo | At sign-in | the user | It needs the user's npm/Node environment and the Tailscale CLI. |
| QuestLearn watchdog | At startup | `SYSTEM` | It must restart the backend before anyone signs in. |
| QuestLearn backup | Daily 02:30 | `SYSTEM` | It must not depend on a signed-in account or a stored password. |
| QuestLearn backup check | Sunday 03:30 | `SYSTEM` | Same, and it runs an hour after the nightly dump. |

Re-register the logon task after moving the repository: it stores an absolute path.

### Before a demo

`questlearn-preflight.ps1` answers whether the demo is actually reachable before
anyone opens it on a projector. It only checks: nothing is started unless asked, and
no power setting is changed.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1 -StartIfDown
```

Exit 0 means every check passed, 1 means one failed, 2 means the host or the
configuration is unusable. A check that could not run says SKIPPED and is never
reported as a pass. Findings are appended to `logs\preflight.log` with timestamps and
no secret values.

| Setting | Environment variable | Default |
| --- | --- | --- |
| `BackendUrl` | `QUESTLEARN_BACKEND_URL` | `http://localhost:8091` |
| `FrontendUrl` | `QUESTLEARN_FRONTEND_URL` | `http://localhost:5180` |
| `PublicUrl` | `QUESTLEARN_PUBLIC_URL` | `https://questlearn.taileb48b2.ts.net` |
| `Retries` | `QUESTLEARN_PREFLIGHT_RETRIES` | 3 |
| `TimeoutSeconds` | `QUESTLEARN_PREFLIGHT_TIMEOUT` | 10 |
| `RetryDelaySeconds` | `QUESTLEARN_PREFLIGHT_RETRY_DELAY` | 3 |
| `LogPath` | `QUESTLEARN_PREFLIGHT_LOG` | `logs\preflight.log` |
| `Email` | `QUESTLEARN_EMAIL` | none, so sign-in is SKIPPED |
| `Password` | `QUESTLEARN_PASSWORD` | none, then `DEMO_PASSWORD` from `questlearn-backend\.env` |

Each value can also be passed as a parameter. The password deliberately has no
parameter: it would land in the process command line. Without both an email and a
password, the sign-in check says SKIPPED rather than guessing.

| Check | A FAIL means | What to do |
| --- | --- | --- |
| AC Power | the machine is on battery, or the battery state cannot be read; nothing else is checked | connect the charger and re-run |
| Standby Prevention | Windows refused the execution-state request | run from an interactive window and keep the lid open |
| Backend Readiness | `/actuator/health` did not answer, did not answer 200, or did not report `UP` | `scripts\questlearn-up.ps1`, or re-run with `-StartIfDown` |
| Frontend Readiness | the preview did not answer or served something other than the app shell | `scripts\questlearn-up.ps1`; `npm run publish` if the bundle is stale |
| Frontend API Proxy | the preview's `/api` did not reach the API (5xx or no answer) | start the backend and check `SERVER_PORT` |
| Public URL Accessibility | DNS, TLS, timeout or HTTP failure at the Funnel root | `tailscale funnel status`, then `tailscale funnel --bg 5180` |
| Login Page Accessibility | `/login` was not served through the Funnel | check the Funnel first, then `npm run publish` |
| Authentication Verification | the public login rejected the credentials, was throttled, or the token failed `/auth/me` | check the email and password; reset the demo password from `/admin` if it changed |

The public checks confirm the Funnel serves the app shell and that a real sign-in
works; they do not click through pages, so the rendered page still deserves a look in
a browser. `-DryRun` skips the keep-awake request and the login call, and ignores
`-StartIfDown`.

The execution-state request (`ES_CONTINUOUS | ES_SYSTEM_REQUIRED`) is released in a
`finally` block, including on Ctrl+C. A hard kill, a crash or power loss cannot run
that cleanup, but Windows drops the request with the thread, so no setting is left
behind. It also has no vote in a firmware-level Modern Standby transition, which is
why the AC check comes first.

## 7.2 Running from source

### Prerequisites

- Java 21 and Maven
- Node 20+ (CI uses Node 24) and npm
- PostgreSQL (CI uses 16; the local operations scripts expect the client tools under
  `C:\Program Files\PostgreSQL\18\bin`, so adjust `$pgBin` in the backup, restore and
  verify scripts if your install differs)
- A Groq API key only if you want the viva or AI authoring to work
- A mail provider only if you want verification and reset links delivered

### 1. Database

```bash
createdb -U postgres questlearn
```

The schema is owned by Flyway (`spring.flyway.locations=classpath:db/migration`) and
Hibernate is set to `validate`, so a drifted schema fails at startup instead of being
silently changed. With no database at all, the `h2` profile is a zero-setup trial:

```bash
cd questlearn-backend
mvn spring-boot:run -Dspring-boot.run.profiles=h2
```

H2 stores everything in `./data/questlearn.mv.db` and opens `/h2-console`. It is a
convenience profile, **not** a production substitute: it does not reproduce
PostgreSQL's JSONB, constraints or Flyway behaviour, which is exactly why the
integration suite runs against real PostgreSQL.

### 2. Configuration

The backend imports optional `.env` files from the working directory and its parent:

```properties
spring.config.import=optional:file:./.env[.properties],optional:file:../.env[.properties]
```

Started from `questlearn-backend`, that means `questlearn-backend/.env` and the
repository-root `.env`. Put a key in one place to avoid wondering which copy won.
Environment variables still take precedence over both.

`application.properties` holds the defaults; `application-prod.properties` makes the
dangerous ones mandatory. The keys worth knowing:

| Area | Keys | Default behaviour |
| --- | --- | --- |
| Port | `SERVER_PORT` | `8080` in the property file; the local `.env` uses `8091`. |
| Database | `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/questlearn`, `postgres`/`postgres`. |
| JWT | `JWT_SECRET`, `JWT_EXPIRATION_MS` | A development secret and 24 hours. `prod` has **no default secret** and fails to start without one. |
| CORS | `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`. Use a comma-separated list of real origins. |
| Registration | `INSTRUCTOR_INVITE_CODE`, `STUDENT_INVITE_CODE`, `REQUIRE_STUDENT_CODE` | Instructor sign-up is disabled when its code is blank. Student sign-up is open locally and gated in `prod`. |
| Demo accounts | `DEMO_PASSWORD` | With a value, the five seeded accounts are rewritten to it on each start. Without one, a fresh database gets a random password printed once; an existing database is left alone. |
| App links | `APP_BASE_URL` | `http://localhost:5173`; the origin used inside emailed links. |
| Mail transport | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_*`, `MAIL_FROM` | `auto`: Resend when a key is set, SMTP when `MAIL_HOST` is set, otherwise the server log. |
| Reset / verification | `RESET_TOKEN_MINUTES`, `RESET_MAX_PER_HOUR`, `VERIFICATION_TOKEN_HOURS`, `VERIFICATION_MAX_PER_HOUR` | 30 minutes / 3 per hour, 48 hours / 3 per hour. |
| Reminders | `NOTIFICATIONS_ENABLED`, `NOTIFICATIONS_CRON`, `NOTIFICATIONS_DUE_SOON_DAYS`, `NOTIFICATIONS_RETENTION_DAYS` | Off; 07:00 UTC; a 7-day due-soon window; 120-day ledger retention. |
| Login throttle | `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | 5 failures, 15-minute lock. In memory. |
| AI | `GROQ_API_KEY`, `GROQ_REASONING_MODEL`, `GROQ_FALLBACK_MODEL`, `GROQ_TRANSCRIPTION_MODEL`, `AI_DAILY_LIMIT`, `AI_HOURLY_LIMIT`, `AI_MAX_CONCURRENT_VIVAS`, `AI_MAX_AUDIO_BYTES` | No key means AI answers 503; models `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `whisper-large-v3-turbo`; 150/day, 30/hour, 4 concurrent, 25 MB audio. `prod` lowers the audio cap to 8 MB. |
| Course materials | `VERITY_ENABLED`, `VERITY_BASE_URL`, `VERITY_SERVICE_EMAIL`, `VERITY_SERVICE_PASSWORD`, `VERITY_MAX_FILE_BYTES`, `VERITY_MAX_MATERIALS_PER_COURSE`, `VERITY_CONNECT_TIMEOUT_MS`, `VERITY_READ_TIMEOUT_MS` | Off by default: the materials page answers 503. When on, `http://localhost:8080/api/v1`, 25 MB PDFs, 20 per course, 5 s connect / 120 s read. |
| Lesson media | `MEDIA_STORAGE`, `MEDIA_VIDEO_DIR`, `MEDIA_UPLOAD_TTL_MINUTES`, `MEDIA_PLAYBACK_TTL_MINUTES`, `MEDIA_MAX_VIDEO_BYTES`, `MEDIA_S3_*` | `disk` in `./uploads/videos`; 15-minute upload links, 60-minute playback links, 100 MB per video. `s3` requires the bucket, endpoint and keys. |
| Multipart | `MEDIA_MAX_UPLOAD`, `MEDIA_MAX_REQUEST` | 110 MB / 120 MB. This is the transport ceiling; the service checks are smaller. |
| Bootstrap admin | `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | Only read on the first start of an empty database in `prod`. Remove the password afterwards. |
| Observability | Actuator `health,info,metrics`, SLO buckets, 365-day histogram expiry | `/actuator/health` is public; every other actuator endpoint is admin-only. |

Never print the values of `JWT_SECRET`, `DEMO_PASSWORD`, `DB_PASSWORD`,
`GROQ_API_KEY`, `RESEND_API_KEY`, `VERITY_SERVICE_PASSWORD` or the SMTP password in
a terminal transcript, issue, screenshot or support message. The files are
gitignored for a reason.

### 3. Backend

```bash
cd questlearn-backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xms256m -Xmx768m"
```

or package and run the jar the demo actually uses:

```bash
cd questlearn-backend
mvn -B -DskipTests package
java -Xms256m -Xmx768m -jar target/questlearn-1.0.0.jar --server.port=8091
```

Health: `http://localhost:8091/actuator/health`. Interactive API docs in a
non-`prod` profile: `http://localhost:8091/swagger-ui.html`. Both the Swagger UI and
`/v3/api-docs` are disabled by the `prod` profile.

### 4. Frontend

Development, with hot reload and the API proxied to the detected backend port:

```bash
cd questlearn-frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. `vite.config.js` reads `SERVER_PORT` from the backend
`.env` (or the root `.env`), falls back to 8091, and probes the target once at startup
so a wrong backend is printed in the terminal instead of surfacing as a page full of
failed requests.

Production build, the way the public site runs it:

```bash
cd questlearn-frontend
npm run build
npm run preview
```

Preview binds all interfaces on 5180, keeps the same `/api` proxy and host allowlist,
and reads `dist` from disk. `npm run watch` rebuilds `dist` on every frontend save, so
a change reaches the public URL in about a second.

### 5. Public URL

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' funnel --bg 5180
```

`--bg` keeps the Funnel registered with the Tailscale service, so it resumes after a
reboot instead of waiting for the startup script. Check it with:

```powershell
tailscale funnel status
```

The public address is `https://questlearn.taileb48b2.ts.net`. The same hostname is in
Vite's `allowedHosts`; do not disable that check with `true`, because it is what stops
a DNS-rebinding page from reading the preview server.

## 7.3 Publishing a change

### Frontend only

1. Save the file. `npm run watch` rebuilds `dist`; preview picks it up.
2. If the watcher is not running, or you want a controlled publish:

   ```bash
   cd questlearn-frontend
   npm run publish
   ```

3. `questlearn-publish.ps1` rebuilds the bundle, stops only the process that owns
   5180, starts preview again, reads the bundle name from `dist/index.html`, and
   checks that the public URL serves that exact file.
4. Verify in a real browser, not only in the terminal. A cache-busting reload
   (`Ctrl+F5`) is enough to confirm the new markup or copy.

A published frontend change does **not** restart the backend. That is why a copy or
layout fix can ship while students are mid-quiz.

### Backend only

1. The Java watcher packages and restarts on save, restoring the previous jar if the
  build fails.
2. If the watcher is not running, build and restart by hand. Expect a short `502`
  from the public URL between the stop and the new process answering; the frontend's
  load banners and auto-retry exist for that window.
3. Watch `logs/backend.log`, `logs/backend.err.log` and `logs/backend.start.log`.
  The start log records the exact heap flags and working directory, which is the
  first thing to check when the JVM behaves differently from a manual run.
4. Verify the affected flow in a browser.

The local backend is owned by a process the watchdog may have started, sometimes as
`SYSTEM`. Restarting it can therefore require an elevated prompt. Killing the JVM
without the watchdog noticing is possible; the watchdog will bring it back after its
two-minute failure window.

### Both

Rebuild the frontend, restart the backend, then check:

- `http://localhost:8091/actuator/health` returns 200;
- `http://localhost:5180/` serves the app;
- the public URL serves the bundle hash named in `dist/index.html`;
- sign-in works for one student and one instructor;
- the changed screen behaves in the browser, including the narrow layout.

## 7.4 Configuration profiles

| Profile | Use | What changes |
| --- | --- | --- |
| default | local PostgreSQL demo | Flyway on, schema validated, 24-hour tokens, Swagger on, localhost CORS. |
| `prod` | a real deployment | `JWT_SECRET` and `CORS_ORIGINS` are mandatory; student sign-up requires an institution code; Swagger is off; graceful shutdown with 30 s drain; 8-hour tokens; larger DB pool; 8 MB viva audio; bootstrap admin read once. |
| `h2` | quick trial, no PostgreSQL | File-backed H2 in PostgreSQL mode, H2 console on. Not schema-equivalent, not for production. |
| `it` | integration tests | Reads `IT_DB_URL`, `IT_DB_USER`, `IT_DB_PASSWORD`; used only by the PostgreSQL suite. |

`application-prod.properties` deliberately fails closed: an unset JWT secret or CORS
origin stops startup instead of falling back to a development value, and an unset
student code means nobody can self-register rather than everybody can.

## 7.5 Testing

### Backend

```bash
cd questlearn-backend

# Fast: unit tests. The PostgreSQL suite is skipped when IT_DB_URL is unset.
mvn test

# Full lifecycle, including the PostgreSQL integration suite when configured.
mvn verify

# One class while iterating.
mvn -Dtest=VivaGraderTest test
```

The integration class is `QuestLearnApiIntegrationTest`, annotated with
`@EnabledIfEnvironmentVariable(named = "IT_DB_URL", matches = ".+")`. To run it:

```powershell
$env:IT_DB_URL = 'jdbc:postgresql://localhost:5432/questlearn_it'
$env:IT_DB_USER = 'postgres'
$env:IT_DB_PASSWORD = '<your test database password>'
mvn verify
```

Create `questlearn_it` first. The suite uses the production schema on purpose; H2
would not catch JSONB, Flyway or constraint drift. Each test creates its own
instructor, course, nodes and quiz, so it does not depend on the demo seed.

`mvn verify` stays green when the integration class is skipped. The CI job therefore
reads the Surefire XML and fails if the class is missing, skipped, or reports fewer
than ten tests. A green CI backend job means the PostgreSQL suite really ran.

At the time of writing the backend suite is **232 tests across 27 test classes**
(unit plus PostgreSQL, 68 of them skipped locally because `IT_DB_URL` is unset). It
covers grading, gamification arithmetic, deadline resolution, viva parsing and
concurrency, quotas, telemetry, media storage, auth, admin rules, announcement
visibility, course-material mapping and the VerityAI HTTP client, and the end-to-end
API. CI is the run that proves the PostgreSQL suite.

### Frontend unit tests

```bash
cd questlearn-frontend
npm ci
npm test                 # vitest run
npx vitest run src/services/deadlines.test.js
```

Vitest runs in jsdom. Playwright owns `e2e/`, and `vite.config.js` excludes that folder
from Vitest so the two runners never collect each other's specs. At the time of
writing there are **55 unit tests**. They cover the change-password dialog, the
verification banner, formatted text escaping, the deadline panel, MCQ selection, the
quiz editor's JSON round-trip, dialog focus, deadline helpers, media URL detection,
CSV quoting, the verification page and the course-materials page.

### Browser tests (Playwright)

The Playwright suite is the only run that drives real pages against the real API.

```bash
cd questlearn-frontend
npx playwright install chromium     # once per machine
npm run test:e2e
```

Prerequisites:

- the backend on `:8091`, healthy, with the demo seed;
- `DEMO_PASSWORD` available. The specs prefer the environment variable and otherwise
  read the repository-root `.env`; they never print the value.
- port 5180 free, or an existing preview/dev server that `reuseExistingServer` can
  reuse. If none exists, Playwright starts `npm run dev -- --port 5180 --strictPort`.

At the time of writing there are **23 tests across six specs**:

| Spec | Covers |
| --- | --- |
| `smoke.spec.js` | Public pages, sign-up, joining a course, clearing a node, the instructor roster, the members-only class-code path, cleanup after failure. |
| `studio.spec.js` | Unpublished-course delete explained to keyboard users, node auto-placement, the reset-node dialog, and the shared analytics links. |
| `next-node.spec.js` | The dashboard's "pick up here" deep link into the skill tree, and the message for a stale `node` parameter. |
| `mobile-nav.spec.js` | The mobile menu closes on its own X and on an outside tap without fighting the toggle. |
| `admin.spec.js` | The telemetry health card, named demo logins, and the narrowed accessibility claims. |
| `announcements.spec.js` | The learner banner and empty state, class vs course visibility, unread counts, mark-all-read, the paged and filtered notices page, staff access, and the studio receipts panel. |

One worker and no parallelism are deliberate: the specs create accounts and mutate
shared demo courses. Each spec deletes the accounts and classes it created, even when
an assertion fails, so repeated local runs do not turn into a pile of test students.
The suite still expects the demo accounts to exist.

Useful options:

```bash
npx playwright test e2e/mobile-nav.spec.js
npx playwright test --headed
npx playwright test --debug
npx playwright show-report
```

Artifacts on failure: `test-results/` and `playwright-report/`. CI uploads both for
seven days.

### Build checks

```bash
cd questlearn-backend && mvn -B -DskipTests package
cd questlearn-frontend && npm run build
```

The frontend build must stay clean. It splits React, motion, animation and icon code
into separate chunks so the sign-in page never downloads Lottie or confetti.

### Continuous integration

`.github/workflows/ci.yml` runs three jobs on every push and pull request:

| Job | What it proves |
| --- | --- |
| `backend` | Starts PostgreSQL 16, runs `mvn -B verify`, then inspects the Surefire report: the integration class must exist, have zero skips, and report at least ten tests. |
| `frontend` | `npm ci`, `npm test`, `npm run build` on Node 24. |
| `e2e` | Starts PostgreSQL 16, builds the jar, starts it on `:8091` with a CI-only JWT secret and `CORS_ORIGINS=http://localhost:5180`, waits for health, proves the seeded instructor can sign in with `DEMO_PASSWORD`, installs Chromium, runs the Playwright suite, and uploads the report if it fails. |

The e2e job sets `DEMO_PASSWORD=ci-demo-password-2026` for its throwaway database.
That value is not a production secret and is not used by the local demo.

## 7.6 Observability

### Request tracing

`RequestTraceFilter` gives every request an id, puts it in the response header
`X-Request-Id`, in the logging MDC and in error bodies. A support report that quotes
the id can be matched to the exact log lines for that request, including the final
status and duration.

### Telemetry

`GET /admin/telemetry` (admin only) returns:

```text
uptimeSeconds, requests, serverErrors,
p50Ms, p95Ms, p99Ms,
recentErrors: [{ at, requestId, method, path, status, message, durationMs }]
```

The numbers are for the life of the process, not a rolling window: a freshly restarted
server is not "low traffic", and the admin page says so. The percentiles come from
Micrometer's HTTP server timer, with explicit SLO buckets because the simple in-memory
registry only fills the buckets it is given. The histogram expiry is set to 365 days so
the request count and the histogram describe the same period; without that, the count
kept climbing while the buckets emptied and every tail number fell through to the
5-second ceiling.

### Audit trail

Privileged actions write an `AdminAuditEntry` with the actor, a stable action key, a
target and a detail sentence. `GET /admin/audit` returns the newest first. Examples:
`course.published`, `course.archived`, `course.deleted`, `user.role_changed`,
`user.password_reset`, demo-password rotation. The feed is in memory and restarts with
the process; it is an operational convenience, not a compliance archive.

### Logs

| File | Contents |
| --- | --- |
| `logs/backend.log` | Standard output of the current JVM. |
| `logs/backend.err.log` | Standard error of the current JVM. |
| `logs/backend.previous.log`, `.previous.err.log` | The run before the current one, kept because a start truncates the live file. |
| `logs/backend.start.log` | Append-only record of each start command, heap flags, port and working directory. |
| `logs/backend.build.log`, `.err.log` | Maven output from the Java watcher. |
| `logs/frontend.log`, `.err.log` | Preview server output. |
| `logs/frontend.build.log`, `.err.log` | Production build output. |
| `logs/frontend.watch.log`, `.err.log` | `vite build --watch` output. |
| `logs/watchdog.log` | Health checks, restarts and alert delivery. |
| `logs/restore.log`, `logs/verify-backup.log` | Restore and backup-verification detail. |

Every backend log line carries the request id for the request that wrote it.

### Health

`/actuator/health` is public and is what the startup scripts, the watchdog and CI
poll. `management.health.mail.enabled=false` is intentional: mail is optional, and a
health endpoint that goes DOWN because nobody configured SMTP would page someone about
a feature that was never switched on.

## 7.7 Backup and recovery

### What a backup contains

`backups/<yyyyMMdd-HHmmss>/`:

- `questlearn.dump` — `pg_dump --format=custom --no-owner`;
- `uploads.zip` — the lesson video directory, when it has files;
- `manifest.json` — creation time, database name and host, dump size, upload count
  and byte total. No credentials.

The database is not the whole application: uploaded videos live on disk and are not in
PostgreSQL. A restore that only restores the dump leaves video rows pointing at
missing files.

### Taking and restoring

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-backup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-backup.ps1 -Keep 14

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-restore.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-restore.ps1 -Name 20261115-023000
```

Restore is intentionally destructive: it stops the backend, runs `pg_restore --clean
--if-exists --single-transaction`, replaces the uploads directory rather than merging
it, starts the backend and waits for health. A half-restored database that still holds
newer rows would be worse than an obvious restore.

### Proving the backup works

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-verify-backup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-verify-backup.ps1 -KeepScratch
```

This creates `questlearn_restorecheck`, restores into it, checks the Flyway version
and the row floors for users, courses and demo accounts, expands `uploads.zip` and
compares its file count and byte total with the manifest, then drops the scratch
database. It never touches the live database or port 8091, so it is safe while the
demo is serving.

Failure leaves `backups/VERIFY-FAILED.txt`, writes `logs/verify-backup.log`, exits
non-zero and sends an alert through `questlearn-notify.ps1`. A backup that stops
arriving is treated as a failure too: the newest dump must be younger than 48 hours.

### Restore drill

At least once per term:

1. Run the backup check with `-KeepScratch`.
2. Point a temporary backend at the scratch database on a different port.
3. Sign in as a student, open a course, clear a node, confirm the XP and attempt
   history look right.
4. Drop the scratch database.

This catches the failures that a row count cannot: a broken attachment URL, a schema
that validates but a page that cannot read it, and a seeded login that no longer
works.

## 7.8 Security operations

- **Rotate the JWT secret** only with a plan: every existing token becomes invalid and
  everyone signs in again. Do it after a suspected leak, not casually.
- **Rotate the demo password** from the admin page. It rewrites every demo account and
  shows the new value once. The old value stops working everywhere it was written
  down. The audit feed records who did it.
- **Reset a user's password** from the admin page. The temporary value is shown once,
  stored only as a hash, and existing sessions are revoked.
- **Change a role** from the admin page. The target's next request sees the new role;
  no re-login is required because the JWT filter re-reads the row. An admin cannot
  change their own role.
- **Delete an account** only after exporting anything the person needs. Progress,
  attempts and enrolments go with it. The last admin and an instructor who still owns
  a course are refused.
- **Keep CORS narrow.** The allowed origins are the browser origins that should call
  the API; a wildcard with credentials is not a shortcut, it is a mistake.
- **Keep the media directory out of the web root.** It is served through the
  application's resource handler and a random name, not by exposing the folder.
- **Treat `prod` as the only safe profile for a real deployment.** It removes the
  development secret, disables schema discovery and closes open student sign-up.

### Secret guard

A public repository cannot take a credential back, so the same rules run before a
commit exists and after it is pushed:

| Where | What it runs |
| --- | --- |
| `.githooks/pre-commit` | `sh scripts/secret-scan.sh --staged` on the files in the index |
| CI job `secrets` | `sh scripts/secret-scan.sh --tree --history` on the tracked tree and every commit |

`scripts/secret-scan.sh` fails on `.env` and its variants (`.env.example` and the
other templates are allowed), private key material, `.npmrc`/`.pgpass`/`.netrc`, and
strings shaped like provider API keys, private key blocks and password-carrying
PostgreSQL URLs. It prints the rule, file and line, never the value, because that
output is a terminal transcript and a CI log. The tree scan is what catches a secret
that predates the hook.

Enable the hook once per clone, from the repository root:

```bash
git config core.hooksPath .githooks
```

That setting is repository-local, not global. `git commit --no-verify` still bypasses
the hook, which is why the CI job exists; a `secret-scan:allow` marker on a line
silences a deliberate placeholder without weakening the rule.

If the scan reports a real value, rotate it. Deleting the commit or force pushing
over it does not help once it has been pushed: GitHub keeps the object reachable and
the value has to be assumed public.

## 7.9 Course materials (VerityAI)

Course readings are the one feature that depends on a second service. It is optional:
with `VERITY_ENABLED=false` (the default) the Materials page loads and every action
explains that the service is not configured. Nothing else in QuestLearn is affected.

To turn it on:

1. Start VerityAI with its own PostgreSQL/pgvector database and a Groq key. Its
   default port is 8080; QuestLearn's local backend uses 8091, so one of the two
   needs a different port on a shared machine.
2. Register one VerityAI account for QuestLearn. It needs no mailbox; it is only used
   by the backend. VerityAI permits one live session per account, so do not sign in
   as it elsewhere while QuestLearn is running.
3. Put `VERITY_ENABLED=true`, `VERITY_BASE_URL`, `VERITY_SERVICE_EMAIL` and
   `VERITY_SERVICE_PASSWORD` in `questlearn-backend/.env`, then restart the backend.
4. Flyway applies `V17__course_materials.sql` on startup. A failure here is a schema
   problem, not a VerityAI problem.
5. Sign in as the instructor who owns a course, open **Materials**, upload a PDF and wait for
   `Ready`. Ask a question and check that the answer cites a page.

Uploads are PDF-only by name and signature, capped at 25 MB and 20 per course by
default. Questions are charged to the same `AI_HOURLY_LIMIT` / `AI_DAILY_LIMIT` quota
as the viva, so a `429` can come from QuestLearn's quota even when VerityAI is idle.
Only `READY` readings are searched; a course whose uploads are still processing
returns 400 with an explanation rather than an uncited guess.

The document lives in VerityAI, not in QuestLearn's database or media store, so
`questlearn-backup.ps1` does **not** back it up. Back up VerityAI's database and its
file store separately, or accept that readings must be re-uploaded after a restore.
Deleting a course removes its `course_materials` rows but cannot remove the VerityAI
documents, because the cascade happens in SQL; clean those up in VerityAI if the
service account's workspace matters.

Verify the integration at three levels:

| Level | Command or action |
| --- | --- |
| Unit | `mvn -Dtest=VerityAiClientTest,CourseMaterialServiceTest test` |
| Frontend | `npm test` (includes `CourseMaterials.test.jsx`) |
| Live | Upload one PDF, wait for `Ready`, ask a question whose answer is on a known page, then delete the material and confirm it disappears from VerityAI too. |

## 7.10 Announcements

The class announcement channel is deliberately **in-app only** in this version:
posting a note sends no mail, so there is no provider, queue or scheduled job to
watch. A note is a plain-text row in `announcements` (Flyway
`V15__announcements.sql`), capped at 2000 characters and optionally tied to one
class. Read state is a second table, `announcement_reads`
(`V16__announcement_reads.sql`): one row per reader and note, unique on the pair,
both references cascading. Absence of a row is the unread state.

| Where it shows | Who sees it |
| --- | --- |
| Student dashboard banner, the **Notices** nav link and the `/announcements` page | Learners enrolled on a published, non-archived course: the course-wide notes plus the notes for their own classes. The banner shows the newest one with the unread count; the nav link carries the count; the page filters, lists and pages them, marks one or all read, and runs on `GET /announcements`. |
| Studio, Publish step | The course owner and admins: every note, labelled with the class it was sent to, with its read count and percentage, an expandable list of who has not read it, and a delete action. |

The learner endpoints are `GET /announcements` (paged feed with `unreadCount`),
`GET /announcements/unread-count`, `POST /announcements/read-all` and
`POST /announcements/{id}/read`. The staff endpoints are
`GET /courses/{courseId}/announcements/receipts` (counts) and
`GET /announcements/{id}/receipts?status=unread|read|all` (paged names). Receipts
never count the author or a reader outside the note's audience, and no learner can
reach them.

Nothing needs configuring, but three cascade rules matter when a term is tidied up:

- deleting a class deletes the notes addressed to it, so keep anything worth
  archiving before removing the class;
- deleting a course deletes all of its notes;
- deleting the author's account keeps the note the class already read and leaves
  `authorName` empty.

A note is ordinary relational data, so `questlearn-backup.ps1` and
`questlearn-restore.ps1` cover it; there is no file store and no ledger to rebuild.
To verify the channel, run the PostgreSQL suite and read the announcement tests
(`announcementsReachTheWholeCourseOrOnlyTheClassTheyName`,
`onlyTheCourseStaffCanPostAndRemoveAnAnnouncement`) plus the reading and receipt
tests (`markingANoteReadIsIdempotentAndRefusedOutsideTheAudience`,
`twoTabsMarkingTheSameNoteBothAnswer204`, `theAuthorDoesNotSeeTheirOwnNoteAsUnread`,
`theFeedMergesCoursesAndKeepsTheClassBoundary`, `theFeedPagesNewestFirst`,
`aClosedCourseStopsFeedingNoticesWithoutFailingTheRest`,
`markAllReadClearsOnlyTheLearnersOwnUnreadNotes`,
`receiptsCountOnlyTheAudienceAndRefuseEveryoneElse`). They need a database of their
own because the suite truncates every table: create one, then pass
`IT_DB_URL=jdbc:postgresql://localhost:5432/questlearn_it`, `IT_DB_USER` and
`IT_DB_PASSWORD` to `mvn test -Dtest=QuestLearnApiIntegrationTest`. Then sign in as a
student in a class that was not addressed and confirm the other class's note is
absent from the dashboard banner, the nav badge count and the notices page.

## 7.11 Known limits of this deployment

These are deliberate trade-offs for a single-machine classroom demo, not hidden bugs.
They are listed here so nobody plans around them by accident.

| Limit | Consequence | What a larger deployment needs |
| --- | --- | --- |
| Login lockout, AI quota, viva permits, telemetry, audit and the error ring are **in memory** | A restart resets them; two instances do not share them. | Redis or a database-backed counter. |
| Lesson videos are on **local disk** by default | A second instance cannot see the first one's uploads. | Shared object storage (`MEDIA_STORAGE=s3`) or a shared volume. |
| The deadline digest scheduler is **single-instance** | Two instances would send the digest twice. | A leader election or an external scheduler. |
| The demo runs **one JVM with a small Hikari pool** (5 local, 10 prod) | Heavy parallel load queues rather than scaling out. | Tune the pool and the database together; add instances only after moving shared state out of memory. |
| The Funnel points at **one machine** | If the machine sleeps or loses Tailscale, the public URL fails even if the JVM is healthy. | A real host with a stable uptime contract. |
| The local integration suite is **opt-in** (`IT_DB_URL`) | `mvn verify` can be green while the PostgreSQL suite is skipped. | CI's report guard is the required proof. |
| H2 profile is **not schema-equivalent** | It is fine for a smoke run, not for trusting JSONB or migrations. | Always test on PostgreSQL. |
| The public demo serves a **production build**, not the dev server | Source edits are invisible until a rebuild. | That is the intended behaviour. |
| VerityAI allows **one live session per service account** | A second QuestLearn backend using the same account fights the first for the session. | One account per backend, or a multi-session service account in VerityAI. |
| Deleting a course cascades **only the mapping rows** | The PDFs remain in VerityAI's workspace. | A cleanup job or a VerityAI bulk-delete by course tag. |
| `tailscale funnel` is machine-local | A new machine or hostname needs the Funnel and Vite `allowedHosts` updated together. | Configuration management. |

## 7.12 Troubleshooting

| Symptom | First check | Likely fix |
| --- | --- | --- |
| Public page loads but every action says "Cannot reach the QuestLearn server" | `http://localhost:8091/actuator/health` | Start the backend; check the preview's `/api` proxy target and `SERVER_PORT`. |
| Public page is an old bundle after a publish | `dist/index.html` and the bundle hash it names | Re-run `npm run publish`; hard-refresh; check the watcher is alive. |
| Public URL returns 502 but localhost:5180 works | `tailscale funnel status` | Re-register the Funnel with `tailscale funnel --bg 5180`; confirm preview binds all interfaces. |
| `401` on every request | Browser storage and the backend log | The token expired, the secret changed or the session was revoked. Sign in again. |
| `403` on a course link | The course's `published`, `archivedAt`, `membershipRequired` | Publish it, restore it, or join with the class code. |
| `403` on a quiz/viva | The node's status | Clear the prerequisite first; the tree must have been opened. |
| `429` on login | `logs/backend.log` and `LOGIN_MAX_ATTEMPTS` | Wait out the lock or reset the password from admin. The counter is in memory, so a restart clears it. |
| `429` on viva | Concurrent viva count | Wait a few seconds; the permit pool is small on purpose. |
| `503` on AI/viva | `GET /api/v1/ai/status` and `GROQ_API_KEY` | Configure the key; the rest of the app keeps working without it. |
| `502` on viva / AI | Groq status and `logs/backend.log` | Upstream failure; retry later. Do not retry in a tight loop. |
| `413` on viva | Recording length/bitrate | Keep the spoken answer under 80 seconds or type it. |
| Verification/reset mail never arrives | `logs/backend.log` for the development adapter line | Configure `RESEND_API_KEY` or SMTP; the link is logged locally when no provider is set. |
| Flyway fails at startup | The error names the migration and the schema object | Do not switch `ddl-auto` to `update`; restore the matching backup or add a forward migration. |
| Backend starts with the wrong heap | `logs/backend.start.log` | Start through `Start-Backend`/the scripts, which apply `-Xms256m -Xmx768m`. |
| Upload link says it expired | The ticket's `expiresAt` | Choose the file again; upload tickets last 15 minutes by default. |
| Upload link says it is not valid | The URL was edited or truncated | Request a new ticket; the signature is the credential. |
| The watchdog keeps restarting | `logs/watchdog.log` and `logs/backend.err.log` | Fix the startup failure; the watchdog stops after one alert per outage, not after one attempt. |
| Restore says no jar | `questlearn-backend/target/questlearn-1.0.0.jar` | Build with `mvn -B -DskipTests package` before restoring. |
| Backup check fails with "past the 48 hour limit" | Task Scheduler and `backups/` | Re-register the backup task; run a backup manually and verify it. |
| Two instances fight over the port | `Get-NetTCPConnection -LocalPort 8091` | Stop the extra process; the scripts stop the owner of the port, never a name match. |

## 7.13 A short release checklist

1. `mvn -B verify` in `questlearn-backend` with `IT_DB_*` set, or confirm CI ran the
   PostgreSQL suite.
2. `npm test` and `npm run build` in `questlearn-frontend`.
3. `npm run test:e2e` against a running backend and seeded demo data.
4. Publish the frontend and restart the backend only if backend code changed.
5. Sign in in a real browser as one student, one instructor and one admin.
6. Clear one node as a student; confirm the XP burst, history and roster update.
7. Open one studio screen, one roster and one analytics page as the instructor.
8. Check `GET /admin/telemetry` for server errors and a sane tail latency.
9. Confirm the backup task ran and `questlearn-verify-backup.ps1` passes.
10. Leave the working tree in a state someone else could run; the docs in this
    directory are part of that state.
