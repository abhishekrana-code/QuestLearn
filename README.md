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

- **Visual skill-tree curriculum** — node-based course progression where completing a prerequisite
  unlocks its child nodes. Nodes render on an SVG canvas with animated edges, pulsing unlocked
  states, shaking locked states and gold-ringed completed states.
- **Gamification engine** — server-side XP awards, level-up calculation, daily streak counters and
  animated Lottie/confetti milestone celebrations.
- **Interactive micro-assessments** — multiple-choice, code-snippet ordering and drag-and-drop
  matching quizzes stored as PostgreSQL `JSONB`, scored **on the server** so XP cannot be faked.
- **Course catalogue and enrollment** — students browse every published quest, preview its whole
  path, then join the ones they are taking. Joined courses appear on the dashboard; leaving keeps
  the work they have already done.
- **Role-based access control (RBAC)** — strictly JWT-secured boundaries between **Student**,
  **Instructor** and **Admin** dashboards, enforced with `@PreAuthorize` on the controller layer.
- **Viva boss battles** — every node can be cleared by *answering the examiner* instead of taking the
  quiz. Speak it and the recording is transcribed by Groq `whisper-large-v3-turbo`, or type it when
  there is no microphone; either way `openai/gpt-oss-120b` grades it against the node's own topics
  and replies with a score, strengths, gaps, actionable feedback and a follow-up question. The verdict
  is spoken back with the browser speech synthesiser. Audio is streamed for grading and never stored.
  Every attempt is kept, so the node shows the trail — 52% typed, then 75% spoken — behind the best
  score.
- **AI quest authoring** — an instructor describes a topic and gets a whole draft quest: linked
  nodes, lesson sections, takeaways, quizzes and a boss viva each, ready to review and publish.
  Generated content is validated server-side before it is saved.
- **High-performance animations** — Framer Motion and Lottie, with every animation bundled locally
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
credentials in the gitignored `questlearn-backend/.env` file — it is imported automatically at
startup, so no shell exports are needed:

```ini
DB_URL=jdbc:postgresql://localhost:5432/questlearn
DB_USERNAME=postgres
DB_PASSWORD=your_password
```

Environment variables still take precedence over the file when both are set.

**No PostgreSQL running?** Start the bundled zero-setup H2 profile instead — schema and demo data
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
every node. The demo student already has two nodes cleared, 220 XP, level 2 and a 4-day streak, so
the dashboard and leaderboard are populated from the first login.

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

### Courses & nodes

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/courses` | authenticated | Role-filtered course list, each with `enrolled` and `enrolledCount` |
| `GET` | `/courses/mine` | authenticated | Courses the learner has joined (staff get their normal list) |
| `POST` | `/courses/{id}/enroll` | Student | Join a published course; idempotent |
| `DELETE` | `/courses/{id}/enroll` | Student | Leave a course; progress and XP are kept |
| `GET` | `/courses/{id}` | authenticated | Course summary |
| `GET` | `/courses/{id}/roster` | Instructor (owner), Admin | Who joined, with each learner's per-node status |
| `POST` | `/courses` | Instructor, Admin | Create a draft course |
| `PATCH` | `/courses/{id}/publish?published=true` | Instructor (owner), Admin | Publish / unpublish |
| `POST` | `/courses/{id}/modules` | Instructor (owner), Admin | Add a skill node |
| `PUT` | `/modules/{id}` | Instructor (owner), Admin | Edit a node's title, summary, lesson and XP |
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
| `GET` | `/leaderboard` | Student, Admin | Top 10 students by XP |

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
| `GET` | `/admin/users?query=` | Admin | All accounts, optionally filtered by name or email |
| `PATCH` | `/admin/users/{id}/role` | Admin | Change a role (not your own); effective on the target's next request |
| `POST` | `/admin/users/{id}/reset-password` | Admin | One-time temporary password; revokes that account's live sessions |
| `DELETE` | `/admin/users/{id}/modules/{moduleId}/progress` | Admin | Reset one node so a learner can retry it |
| `GET` | `/admin/stats` | Admin | Platform counters |
| `GET` | `/admin/audit` | Admin | Last 50 privileged actions, newest first |

Password changes (`PATCH /auth/password`) return a fresh token: the caller stays signed
in while every other session for that account is revoked.

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

`CODE_ORDER` — `lines` is the correct order; the client shuffles the display.

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
5. **Everything is offline.** Fonts are system fonts, icons come from the bundled `lucide-react`
   package and the Lottie JSON files live in `src/assets/animations/`.

---

## Verifying the Build

```bash
# Backend: compile + package
cd questlearn-backend && mvn -B -DskipTests package

# Frontend: production bundle
cd questlearn-frontend && npm run build
```

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `Cannot reach the QuestLearn API` | Start the backend on the port in `SERVER_PORT` (8091 locally) and check CORS origins |
| `401` on every request | Token expired or cleared — sign in again |
| `403 Course is not published yet` | The instructor must publish the draft first |
| PostgreSQL `password authentication failed` | Set `DB_PASSWORD` (or use the `h2` profile) |
| Lottie animations missing | Ensure `src/assets/animations/*.json` were not excluded by git |
