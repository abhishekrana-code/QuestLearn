# QuestLearn: Gamified RPG-Style LMS

QuestLearn is an interactive, full-stack Learning Management System (LMS) that turns traditional
course curricula into visual RPG-style **skill trees**. Students unlock modules dynamically, earn XP
(Experience Points), maintain daily learning streaks, and complete interactive assessments.

Built with a focus on fluid animations, clean modular architecture, and low-memory local execution.

---

## Key Features

- **Visual skill-tree curriculum** — node-based course progression where completing a prerequisite
  unlocks its child nodes. Nodes render on an SVG canvas with animated edges, pulsing unlocked
  states, shaking locked states and gold-ringed completed states.
- **Gamification engine** — server-side XP awards, level-up calculation, daily streak counters and
  animated Lottie/confetti milestone celebrations.
- **Interactive micro-assessments** — multiple-choice, code-snippet ordering and drag-and-drop
  matching quizzes stored as PostgreSQL `JSONB`, scored **on the server** so XP cannot be faked.
- **Role-based access control (RBAC)** — strictly JWT-secured boundaries between **Student**,
  **Instructor** and **Admin** dashboards, enforced with `@PreAuthorize` on the controller layer.
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

- API: <http://localhost:8080/api/v1>
- Swagger UI: <http://localhost:8080/swagger-ui.html>

### 3. Frontend

```bash
cd questlearn-frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to `http://localhost:8080`.

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
| `GET` | `/courses` | authenticated | Role-filtered course list |
| `GET` | `/courses/{id}` | authenticated | Course summary |
| `POST` | `/courses` | Instructor, Admin | Create a draft course |
| `PATCH` | `/courses/{id}/publish?published=true` | Instructor (owner), Admin | Publish / unpublish |
| `POST` | `/courses/{id}/modules` | Instructor (owner), Admin | Add a skill node |
| `POST` | `/modules/{id}/quiz` | Instructor (owner), Admin | Attach or replace a JSONB quiz |

### Progression

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/courses/{id}/skill-tree` | authenticated | Nodes merged with LOCKED / UNLOCKED / COMPLETED |
| `GET` | `/modules/{id}` | authenticated | Lesson content + sanitized quiz |
| `POST` | `/modules/{id}/complete` | Student, Admin | Score quiz, award XP, unlock children |
| `GET` | `/leaderboard` | Student, Admin | Top 10 students by XP |

### Admin

| Method | Path | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/users` | Admin | All accounts |
| `PATCH` | `/admin/users/{id}/role` | Admin | Change a role (not your own) |
| `GET` | `/admin/stats` | Admin | Platform counters |

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
| `Cannot reach the QuestLearn API` | Start the backend on port 8080 and check CORS origins |
| `401` on every request | Token expired or cleared — sign in again |
| `403 Course is not published yet` | The instructor must publish the draft first |
| PostgreSQL `password authentication failed` | Set `DB_PASSWORD` (or use the `h2` profile) |
| Lottie animations missing | Ensure `src/assets/animations/*.json` were not excluded by git |
