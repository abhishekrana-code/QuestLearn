# QuestLearn: Gamified RPG-Style LMS

[![CI](https://github.com/abhishekrana-code/QuestLearn/actions/workflows/ci.yml/badge.svg)](https://github.com/abhishekrana-code/QuestLearn/actions/workflows/ci.yml)

QuestLearn is an interactive, full-stack Learning Management System (LMS) that turns traditional
course curricula into visual RPG-style **skill trees**. Students unlock modules dynamically, earn XP
(Experience Points), maintain daily learning streaks, and complete interactive assessments.

Built with a focus on fluid animations, clean modular architecture, and low-memory local execution.

For an administrator's assessment of what is production-ready and what a real classroom
still needs, see [`AUDIT.md`](AUDIT.md).

---

## Key Features

- **Visual skill-tree curriculum**: node-based course progression where completing a prerequisite
  unlocks its child nodes. Nodes render on an SVG canvas with animated edges, pulsing unlocked
  states, shaking locked states and gold-ringed completed states.
- **Gamification engine**: server-side XP awards, level-up calculation, daily streak counters and
  animated Lottie/confetti milestone celebrations.
- **Interactive micro-assessments**: multiple-choice, code-snippet ordering and drag-and-drop
  matching quizzes stored as PostgreSQL `JSONB`, scored **on the server** so XP cannot be faked.
- **Course catalogue and enrollment**: students browse every published quest, preview its whole
  path, then join the ones they are taking. Joined courses appear on the dashboard; leaving keeps
  the work they have already done.
- **Role-based access control (RBAC)**: strictly JWT-secured boundaries between **Student**,
  **Instructor** and **Admin** dashboards, enforced with `@PreAuthorize` on the controller layer.
- **Viva boss battles**: every node can be cleared by *answering the examiner* instead of taking the
  quiz. Speak it and the recording is transcribed by Groq `whisper-large-v3-turbo`, or type it when
  there is no microphone; either way `openai/gpt-oss-120b` grades it against the node's own topics
  and replies with a score, strengths, gaps, actionable feedback and a follow-up question. The verdict
  is spoken back with the browser speech synthesiser. Audio is streamed for grading and never stored.
  Every attempt is kept, so the node shows the trail, 52% typed, then 75% spoken, behind the best
  score.
- **AI quest authoring**: an instructor describes a topic and gets a whole draft quest: linked
  nodes, lesson sections, takeaways, quizzes and a boss viva each, ready to review and publish.
  Generated content is validated server-side before it is saved.
- **High-performance animations**: Framer Motion and Lottie, with every animation bundled locally
  so a lab demo works completely offline.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18 (Vite), Tailwind CSS, Framer Motion, Lottie-React, Axios |
| **State management** | React Context API (`AuthContext`, `GamificationContext`) |
| **Backend** | Java 21, Spring Boot 3.4, Spring Security, Spring Data JPA (Hibernate 6) |
| **Database** | PostgreSQL 15+ (relational + `JSONB` for dynamic quiz payloads) |
| **Authentication** | Stateless JWT (jjwt 0.12) + BCrypt password hashing |
| **Build tools** | Apache Maven (`pom.xml`), npm |

---

## Repository Layout

```text
questlearn/
├── README.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── PROJECT_PLAN.md
├── questlearn-backend/          # Spring Boot 3 (Java 21, Maven)
└── questlearn-frontend/         # React 18 + Vite + Tailwind
```

---

## Quick Start (Windows, 8GB RAM)

### 1. Database

Create the database once (native PostgreSQL, no Docker):

```bash
createdb -U postgres questlearn
```

The backend reads `DB_USERNAME` / `DB_PASSWORD` and defaults to `postgres` / `postgres`. Put the real
credentials in the gitignored `questlearn-backend/.env` file, it is imported automatically at
startup, so no shell exports are needed:

```ini
DB_URL=jdbc:postgresql://localhost:5432/questlearn
DB_USERNAME=postgres
DB_PASSWORD=your_password
```

Environment variables still take precedence over the file when both are set.

**No PostgreSQL running?** Start the bundled zero-setup H2 profile instead, schema and demo data
are created automatically in `questlearn-backend/data/`:

```bash
cd questlearn-backend
mvn spring-boot:run -Dspring-boot.run.profiles=h2
```

### 2. Backend

```bash
cd questlearn-backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xms256m -Xmx768m"
```

- API: <http://localhost:8091/api/v1>
- Swagger UI: <http://localhost:8091/swagger-ui.html>

The port comes from `SERVER_PORT` in `questlearn-backend/.env` (8091 by default here; `application.properties`
falls back to 8080 only when that variable is unset).

### 3. Frontend

```bash
cd questlearn-frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite reads `SERVER_PORT` from the backend `.env` and proxies `/api` to
`http://localhost:8091`.

### Demo accounts (seeded on first start)

| Role | Email | Password |
| :--- | :--- | :--- |
| Student | `student@questlearn.dev` | `password123` |
| Instructor | `instructor@questlearn.dev` | `password123` |
| Admin | `admin@questlearn.dev` | `password123` |

The demo course **“Full-Stack Web Engineering Quest”** ships with six linked nodes and a quiz on
every node. The demo student starts with two nodes cleared, a 4-day streak, and work in a second
course, **“Data Structures Detour”** (three nodes, two cleared), so 420 XP, level 3 and both boards, 
combined across courses and scoped to one, are populated from the first login. The rival learners
stay inside the first course, which is what makes the two boards read differently.

---

## Gamification Rules

Level calculation (inverse of the XP threshold):

$$\text{Level} = \lfloor 0.1 \times \sqrt{\text{Total XP}} \rfloor + 1$$

XP required to reach level `L` is `100 × (L − 1)²`. Every node awards its own `xpReward`.

Completing a node is a single `@Transactional` unit of work:

1. Verify the learner's `user_module_progress` row is **UNLOCKED** (blocks duplicate XP farming and
   locked-node submissions).
2. Score the attached quiz on the server; if the score is below `passingScore`, return
   `passed: false` and award nothing.
3. Mark the node **COMPLETED** with its score and timestamp.
4. Unlock every child node (`parent_module_id = current node`) from **LOCKED** to **UNLOCKED**.
5. Add XP, recalculate level, advance the daily streak.
6. Return an `XpAwardResponse` (`xpGained`, `newTotalXp`, `leveledUp`, `unlockedModuleIds`, …) so the
   React client knows whether to fire the Lottie level-up modal.

---

## API Reference

All routes are under `/api/v1`. Protected routes need `Authorization: Bearer <token>`.

### Authentication

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | public | Register a `STUDENT` or `INSTRUCTOR` |
| `POST` | `/auth/login` | public | Returns JWT + profile |
| `GET` | `/auth/me` | authenticated | Live XP / level / streak |
| `POST` | `/auth/password-reset/request` | public | Start a reset; always the same 202 answer |
| `POST` | `/auth/password-reset/confirm` | public | Redeem a reset token and set the new password |
| `POST` | `/auth/verify-email` | public | Confirm an address using the link token |
| `POST` | `/auth/verify-email/resend` | authenticated | Send a fresh confirmation link to your own address |
| `PATCH` | `/auth/password` | authenticated | Change your own password (returns a fresh token) |
| `PATCH` | `/auth/notification-preferences` | authenticated | Turn the daily deadline digest on or off (`{"deadlineEmails": false}`) |

### Password recovery

A student who forgets their password does not need an admin: **Forgot your password?** on the
sign-in page posts the address to `/auth/password-reset/request`. The reply is always the same
(`202`, "if that email belongs to an account…"), so the endpoint cannot be used to discover who is
registered. For a real account the backend mints a 32-byte token, stores only its SHA-256 hash in
`password_reset_tokens`, and emails a link to `/reset-password?token=…`.

- The link **expires after 30 minutes** (`RESET_TOKEN_MINUTES`) and is **single-use**: the
  confirming transaction claims the row with a conditional `UPDATE`, so a double submit cannot
  both succeed.
- Requesting a new link kills every earlier unused link for that account, so a forwarded email
  stops working.
- Redeeming one bumps the account's token version, which signs out every session opened before
  the reset. XP, progress and streaks are untouched, and the account's login lockout is cleared.
- Requests are capped at 3 per address per rolling hour (`RESET_MAX_PER_HOUR`).

Mail is optional. With no provider configured the link is written to the server log
at `WARN`, which is how a local demo or a school without a mail server can hand it
over. Set `RESEND_API_KEY` (or the `MAIL_*` SMTP variables) and `APP_BASE_URL` to
send real email; see **Email delivery** below.

### Email delivery and address confirmation

One `MailService` sends every transactional email, and one `EmailSender` decides how
it leaves the process. `EMAIL_PROVIDER` can be forced to `resend`, `smtp` or `log`;
the default `auto` uses Resend when `RESEND_API_KEY` is set, SMTP when `MAIL_HOST`
is set, and otherwise writes the message to the server log. Asking for a provider
that is not configured fails at startup rather than silently dropping mail.

A new sign-up gets a confirmation link alongside its session. The link carries a
32-byte token; only its SHA-256 hash is stored in `email_verification_tokens`, it
expires after 48 hours (`VERIFICATION_TOKEN_HOURS`), and redeeming it claims the row
with a conditional `UPDATE` so it works once. Asking for another link supersedes
the earlier one. Resends are capped at 3 per account per rolling hour
(`VERIFICATION_MAX_PER_HOUR`).

Verification is **soft on purpose**: an unconfirmed account keeps every permission
and all of its progress. It only sees a "Confirm your email address" reminder on the
dashboard, with a resend button. Accounts that existed before this feature, and the
demo data, are migrated as verified, so nobody is nagged about an address they never
had a way to confirm.

The `/verify-email?token=…` page works signed in or signed out; the link is the
proof. A used, superseded or expired token gets the same 400 with a fresh-link hint,
so the response cannot be used to probe which state it was in.

### Courses & nodes

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/courses` | authenticated | Role-filtered course list, each with `enrolled` and `enrolledCount` |
| `GET` | `/courses/mine` | authenticated | Courses the learner has joined (staff get their normal list) |
| `POST` | `/courses/{id}/enroll` | Student | Join a published course; idempotent |
| `DELETE` | `/courses/{id}/enroll` | Student | Leave a course; progress and XP are kept |
| `GET` | `/courses/{id}` | authenticated | Course summary |
| `GET` | `/courses/{id}/roster?cohortId=&nodeId=&nodeCleared=` | Instructor (owner), Admin | Who joined, with each learner's per-node status; narrow by class, or to who has/hasn't cleared one node |
| `POST` | `/courses/{id}/roster/import` | Instructor (owner), Admin | Enrol a pasted class list (addresses only), reporting which addresses have no student account |
| `GET` | `/courses/{id}/cohorts` | Instructor (owner), Admin | Classes in the course, with codes and sizes |
| `POST` | `/courses/{id}/cohorts` | Instructor (owner), Admin | Create a class; returns its join code |
| `DELETE` | `/cohorts/{cohortId}` | Instructor (owner), Admin | Delete a class; members keep the course and their progress |
| `POST` | `/cohorts/join` | Student | Join a class by code, which also enrolls in its course |
| `PATCH` | `/courses/{id}/members-only?membersOnly=` | Instructor (owner), Admin | Hide a course from the catalogue so only its class codes let students in |
| `GET` | `/courses/{id}/roster/{userId}` | Instructor (owner), Admin | One learner's nodes and graded attempt trail |
| `POST` | `/courses` | Instructor, Admin | Create a draft course |
| `PATCH` | `/courses/{id}/publish?published=true` | Instructor (owner), Admin | Publish / unpublish |
| `POST` | `/courses/{id}/modules` | Instructor (owner), Admin | Add a skill node |
| `PUT` | `/modules/{id}` | Instructor (owner), Admin | Edit a node's title, summary, lesson and XP |
| `PUT` | `/courses/{courseId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Set or move one node's due date |
| `DELETE` | `/courses/{courseId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Make one node self-paced again |
| `POST` | `/modules/{id}/quiz` | Instructor (owner), Admin | Attach or replace a JSONB quiz |
| `POST` | `/modules/{id}/video` | Instructor (owner), Admin | Upload a lesson video (multipart `file`) |
| `PUT` | `/modules/{id}/video-url` | Instructor (owner), Admin | Attach a lesson video hosted elsewhere |
| `DELETE` | `/modules/{id}/video` | Instructor (owner), Admin | Remove the lesson video |

### Media

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/media/videos/{name}` | public | Stream an uploaded lesson video (`Range` supported) |

### Progression

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/courses/{id}/skill-tree` | authenticated | Nodes merged with LOCKED / UNLOCKED / COMPLETED |
| `GET` | `/modules/{id}` | authenticated | Lesson content + sanitized quiz |
| `POST` | `/modules/{id}/complete` | Student, Admin | Score quiz, award XP, unlock children |
| `POST` | `/modules/{id}/viva` | Student, Admin | Multipart `audio` → transcript, verdict, XP, unlock children |
| `POST` | `/modules/{id}/viva` | Student, Admin | JSON `{"answer": "..."}` → typed answer, same grading (no-microphone fallback) |
| `GET` | `/leaderboard/overall` | Student, Admin | Top 10 students by XP summed across every course they have cleared nodes in |
| `GET` | `/leaderboard` | Student, Admin | Top 10 students by lifetime XP |
| `GET` | `/courses/{id}/leaderboard?cohortId=` | Student, Instructor (owner), Admin | Top 10 in one course, by XP earned in it; `cohortId` ranks a single class |

### Deadlines and reminders

A deadline belongs to one node and applies to the whole course. It is **advisory**:
the node stays playable after the due date, and a completion after it is recorded as
`COMPLETED_LATE` rather than blocked. A mail outage or a sick day must never become an
access-control incident, so the server computes one state per learner, 
`UPCOMING`, `DUE_SOON`, `OVERDUE`, `COMPLETED` or `COMPLETED_LATE`, inside the
configurable warning window (`NOTIFICATIONS_DUE_SOON_DAYS`, default 7). The dashboard,
skill tree, node briefing and digest all read that same resolver.

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/me/deadlines` | authenticated | Dated nodes in the courses you joined, plus your digest preference |
| `PUT` | `/courses/{courseId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Set or move a due date (`{"dueAt":"2026-11-20T17:00:00Z"}`) |
| `DELETE` | `/courses/{courseId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Clear the due date |
| `GET` | `/courses/{courseId}/cohorts/{cohortId}/deadlines` | Instructor (owner), Admin | One class's overrides |
| `PUT` | `/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Give one class its own date for a node |
| `DELETE` | `/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | Instructor (owner), Admin | Drop the override and fall back to the course date |

The node date is the course-wide default. A class can answer it with an override
(`cohort_deadlines`), edited from **Class due dates** on the classes page. Only that
class's members see the override, in the dashboard, the skill tree, the node briefing
and the digest alike. A learner who belongs to two classes of one course gets the
earlier of their overrides, so one class cannot quietly extend a date another class
already set. Clearing an override restores the node's own date, because the node date
is never copied into the override row.

The dashboard lists overdue work first, then due-soon and upcoming nodes, and lets a
learner turn the email digest off per account. The digest is **one email per learner**,
not one per node, and is disabled unless `NOTIFICATIONS_ENABLED=true`; the scheduler
runs on the UTC `NOTIFICATIONS_CRON` (default 07:00). A sent reminder is keyed by
learner, node, kind and due date in `deadline_reminders`, so rerunning the job cannot
duplicate an inbox entry while a moved deadline may notify again. A failed send leaves
the row unrecorded, so the next run retries.

Skill-tree nodes and node details now also carry `dueAt` and `deadlineState`.

### AI (Groq)

Both routes answer **503** with an actionable message when `GROQ_API_KEY` is unset, and **502**
when Groq itself fails. A per-account hourly quota (`AI_HOURLY_LIMIT`, default 30) caps spend.

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/ai/status` | authenticated | Whether the key is configured, plus the model names |
| `POST` | `/ai/courses` | Instructor, Admin | Draft a full quest (nodes + quizzes + viva) from a topic |

### Admin

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/users?query=&page=&size=` | Admin | One page of accounts (default 25, capped at 100), optionally filtered by name or email |
| `PATCH` | `/admin/users/{id}/role` | Admin | Change a role (not your own); effective on the target's next request |
| `POST` | `/admin/users/{id}/reset-password` | Admin | One-time temporary password; revokes that account's live sessions |
| `DELETE` | `/admin/users/{id}/modules/{moduleId}/progress` | Admin, course instructor | Reset one node so a learner can retry it (XP for that node is taken back) |
| `GET` | `/admin/stats` | Admin | Platform counters |
| `GET` | `/admin/audit` | Admin | Last 50 privileged actions, newest first |
| `GET` | `/admin/telemetry` | Admin | Uptime, requests served, p50/p95/p99 latency and the last 10 server errors |

Password changes (`PATCH /auth/password`) return a fresh token: the caller stays signed
in while every other session for that account is revoked.

### Observability

Only `/actuator/health` is public. `/actuator/metrics` needs an admin token, and the
admin panel shows the same numbers as `/admin/telemetry`.

Every response carries an `X-Request-Id` header. A well-formed id sent by a proxy is
kept, otherwise one is generated. The same value appears in the log line for that
request and in any error body, so "the page said 500, here is the id" is enough to find
the cause. Server errors (5xx only, never 4xx noise) are also kept in a bounded
in-memory list of the last 100, which is what the admin panel displays; it is a
diagnostic aid rather than an audit trail and clears on restart.

---

## JSONB Quiz Contracts

`MULTIPLE_CHOICE`

```json
{
  "questions": [
    {
      "id": "q1",
      "prompt": "Which hook stores local state?",
      "options": ["useEffect", "useState"],
      "correctIndex": 1,
      "explanation": "useState returns a value plus a setter."
    }
  ]
}
```

`CODE_ORDER`, `lines` is the correct order; the client shuffles the display.

```json
{
  "prompt": "Order the fetch lifecycle correctly.",
  "lines": ["const res = await fetch(url);", "if (!res.ok) throw new Error();"],
  "explanation": "Check response.ok before parsing."
}
```

`DRAG_DROP`

```json
{
  "prompt": "Match each tool to its purpose.",
  "pairs": [{ "left": "display: grid", "right": "Two-dimensional layout" }]
}
```

`correctIndex`, `explanation`, `pairs` and the ordered `lines` never reach the browser: the
sanitizer strips or reshapes them before returning `QuizDto`.

Submission body for `POST /modules/{id}/complete`:

```json
{
  "answers": [
    { "questionId": "q1", "selectedIndex": 1 },
    { "questionId": "code-order", "order": ["line 2", "line 1"] },
    { "questionId": "drag-drop", "matches": { "display: grid": "Two-dimensional layout" } }
  ]
}
```

---

## 8GB RAM Optimization Guide (Windows 10/11)

1. **Run PostgreSQL natively.** Install the Windows PostgreSQL installer (no Docker, no WSL VM
   overhead). Set `postgresql-x64-18` (or `-15`) to **Manual** in `services.msc` so it only runs while
   you are coding, and shrink its footprint in `postgresql.conf`:
   ```conf
   shared_buffers = 128MB
   work_mem = 4MB
   max_connections = 25
   ```
   QuestLearn's HikariCP pool is already capped at 5 connections (`application.properties`).
2. **Constrain the JVM heap.** Run Spring Boot through Maven CLI or VS Code's Extension Pack for
   Java, not a heavy IDE together with the server:
   ```bash
   mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xms256m -Xmx768m"
   ```
3. **Ship a jar for the live demo.** Package once, close the IDE, then run:
   ```bash
   mvn clean package -DskipTests
   java -Xmx512m -jar target/questlearn-1.0.0.jar
   ```
   Closing IntelliJ/VS Code frees roughly 1–2.5 GB.
4. **Keep the frontend production-built** for the demo (`npm run build`, then `npm run preview`);
   Vite's dev server with React StrictMode is convenient but heavier.
5. **Everything is offline.** No font CDN: headings and body use system stacks. Icons come from the bundled `lucide-react`
   package and the Lottie JSON files live in `src/assets/animations/`.

---

## Verifying the Build

```bash
# Backend: compile + package
cd questlearn-backend && mvn -B -DskipTests package

# Frontend: production bundle
cd questlearn-frontend && npm run build
```

### Smoke suite (Playwright)

Two browser tests drive the loops a real learner and teacher go through, and they
are the only checks that exercise the pages against the real API.

1. **Open course:** register a fresh account, join a course from the catalogue,
   clear the first node, then sign in as the instructor and find that learner on
   the roster with `1/6` cleared.
2. **Members-only course:** the instructor flips a course to members only, creates a
   class and reads out its code; a new student cannot see the course in the
   catalogue and is refused the direct link, then joins with the code and lands on
   the skill tree. The test restores the course and deletes its class when it
   finishes, even after a failure.

```bash
# Needs the backend on :8091 (the spec checks and says so if it is missing).
# The dev server is started for you on :5180 if it is not already running.
cd questlearn-frontend
npx playwright install chromium   # once per machine
npm run test:e2e
```

Each run registers a new `smoke.<timestamp>@questlearn.dev` student, so a local
database collects a few of them over time; CI uses a throwaway database.

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `Cannot reach the QuestLearn API` | Start the backend on the port in `SERVER_PORT` (8091 locally) and check CORS origins |
| `401` on every request | Token expired or cleared, sign in again |
| `403 Course is not published yet` | The instructor must publish the draft first |
| PostgreSQL `password authentication failed` | Set `DB_PASSWORD` (or use the `h2` profile) |
| Lottie animations missing | Ensure `src/assets/animations/*.json` were not excluded by git |
