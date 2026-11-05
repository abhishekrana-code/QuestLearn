# Technical Implementation Plan (`IMPLEMENTATION_PLAN.md`)

This document records the code implementation order used to build QuestLearn without breaking
dependencies. Each phase is complete in the current repository.

---

## Phase 1: Environment & Database Bootstrap

1. **Configure PostgreSQL for low RAM** (native installer, no Docker/WSL overhead).
   - Service `postgresql-x64-18` (or `-15`) set to **Manual** in `services.msc`.
   - `postgresql.conf`:
     - `shared_buffers = 128MB`
     - `work_mem = 4MB`
     - `max_connections = 25`
2. **Initialise the Spring Boot project** (`questlearn-backend/pom.xml`):
   - `Spring Web`, `Spring Data JPA`, `Spring Security`, `Validation`, `Lombok`
   - `PostgreSQL Driver` (runtime)
   - `io.jsonwebtoken:jjwt-api/impl/jackson:0.12.6`
   - `springdoc-openapi-starter-webmvc-ui` for Swagger UI
   - H2 (runtime) for the optional zero-setup profile
   - Java 21 toolchain, Spring Boot 3.4.5 parent

> **Note on JSONB mapping:** Hibernate 6.6 (shipped with Boot 3.4) supports
> `@JdbcTypeCode(SqlTypes.JSON)` natively, so `hypersistence-utils` is not required and would
> conflict with this Hibernate version.

---

## Phase 2: Backend Core, Security & RBAC — ✅ done

1. **Entities & repositories**
   - `User`, `Course`, `Module`, `Quiz`, `UserModuleProgress` with the enums `Role`, `QuizType`,
     `ProgressStatus`.
   - `JSONB` fields (`Module.content`, `Quiz.payload`) mapped as `JsonNode` with
     `@JdbcTypeCode(SqlTypes.JSON)`.
   - Unique constraint on `(user_id, module_id)` in `user_module_progress`.
2. **JWT security layer**
   - `JwtUtil` — sign, parse, role extraction, expiry.
   - `JwtAuthenticationFilter extends OncePerRequestFilter` — populates the security context.
   - `SecurityConfig` — stateless sessions, CORS for `http://localhost:5173`, JSON 401/403 handlers,
     `@EnableMethodSecurity`, BCrypt encoder.
3. **Auth endpoints** (`AuthController`)
   - `POST /api/v1/auth/register` (Student or Instructor; Admin blocked)
   - `POST /api/v1/auth/login` (JWT + profile + XP/level)
   - `GET /api/v1/auth/me`
4. **Error handling** — `ApiException` + `GlobalExceptionHandler` with field-level validation errors.

---

## Phase 3: Course Skill-Tree & Gamification API — ✅ done

1. **Instructor endpoints** (`CourseController`)
   - `POST /api/v1/courses`
   - `PATCH /api/v1/courses/{id}/publish`
   - `POST /api/v1/courses/{courseId}/modules` (links `parentModuleId`, stores layout positions)
   - `POST /api/v1/modules/{moduleId}/quiz` (validates and stores a `JSONB` payload)
2. **Student progression endpoints** (`ProgressController`)
   - `GET /api/v1/courses/{courseId}/skill-tree` — nodes merged with the learner's
     `LOCKED` / `UNLOCKED` / `COMPLETED` status; first call also enrols the learner.
   - `GET /api/v1/modules/{moduleId}` — lesson content + sanitized quiz.
   - `POST /api/v1/modules/{moduleId}/complete` — evaluates the quiz, awards XP, updates the streak,
     unlocks child nodes, returns level-up status.
   - `GET /api/v1/leaderboard` — top 10 students by XP.
3. **Admin endpoints** (`AdminController`) — user list, role change, stats.
4. **Quiz evaluation** (`QuizService`) — validates instructor payloads, strips answers before they
   leave the server, and scores MCQ / code-order / drag-drop submissions.

---

## Phase 4: React Frontend & Animation Engine — ✅ done

1. **Scaffold Vite project**
   ```bash
   npm create vite@latest questlearn-frontend -- --template react
   cd questlearn-frontend
   npm install axios react-router-dom framer-motion lottie-react lucide-react canvas-confetti
   npm install -D tailwindcss postcss autoprefixer
   ```
2. **Global context providers**
   - `AuthContext.jsx` — token, cached profile, login/logout, 401 handling.
   - `GamificationContext.jsx` — live `totalXp`, `currentLevel`, `streakDays` and an `award(result)`
     function that animates the navbar XP bar, shows the XP toast and opens the Lottie/confetti
     level-up modal.
3. **Interactive UI modules**
   - `SkillTreeCanvas.jsx` — SVG edges + absolutely positioned nodes, vertical/branching layout.
   - `SkillNode.jsx` — pulsing UNLOCKED, greyed LOCKED with a shake on click, gold COMPLETED.
   - `QuizPlayer.jsx` / `MCQCard.jsx` / `CodeOrderQuiz.jsx` / `DragDropQuiz.jsx` — Framer Motion
     `Reorder.Group` for code ordering and an HTML5 drag-and-drop matcher with a click fallback.
4. **Role dashboards** — `StudentDashboard`, `SkillTreePage`, `InstructorStudio`, `AdminPanel`,
   `Leaderboard`, plus login/register with one-click demo accounts.

---

## Phase 5: Seeding, Polish & Local Hosting Demo — ✅ done

- `DataInitializer` implements `ApplicationRunner` and seeds, only when the database is empty:
  - 1 Admin, 1 Instructor, 3 Students.
  - 1 complete demo course (“Full-Stack Web Engineering Quest”) with 6 interconnected nodes.
  - A pre-built quiz on every node (2 MCQ, 2 code-order, 2 drag-and-drop).
  - Partial progress for the demo student (2 completed nodes, 220 XP, level 2, 4-day streak).
- Offline-first assets: Lottie JSON in `src/assets/animations/`, icons from `lucide-react`, system
  fonts.
- Runtime tuning documented in `README.md` (`-Xms256m -Xmx768m`, pooled connections capped at 5).

---

## Phase 6: Verification

```bash
cd questlearn-backend  && mvn -B -DskipTests package   # compiles and repackages the jar
cd questlearn-frontend && npm run build                # production Vite bundle
```

Manual smoke test checklist:

1. Sign in as the student → dashboard shows 220 XP, level 2, 4-day streak.
2. Open the skill tree → two completed nodes, two unlocked, two locked.
3. Play “JavaScript Essentials” code-order quiz → XP awarded, sibling/child node unlocks.
4. Sign in as the instructor → create a node, attach a quiz, publish the course.
5. Sign in as the admin → change a role, publish/unpublish a course.
