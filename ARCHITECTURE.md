# System Architecture (`ARCHITECTURE.md`)

QuestLearn follows a decoupled client-server REST architecture. The React SPA talks to a stateless
Spring Boot REST API backed by a normalized PostgreSQL schema that uses hybrid `JSONB` columns for
flexible interactive content.

---

## 1. Directory Structure

```text
questlearn/
├── questlearn-backend/                       # Spring Boot 3 (Java 21, Maven)
│   ├── src/main/java/com/questlearn/
│   │   ├── config/                           # SecurityConfig, OpenApiConfig, DataInitializer
│   │   ├── security/                         # JwtUtil, JwtAuthenticationFilter
│   │   ├── controller/                       # Auth, Course, Progress, Admin controllers
│   │   ├── service/                          # AuthService, CourseService, ProgressService,
│   │   │                                     # QuizService, GamificationService, AdminService
│   │   ├── repository/                       # Spring Data JPA interfaces
│   │   ├── model/                            # User, Course, Module, Quiz, UserModuleProgress
│   │   ├── dto/                              # Request/response records (+ AppUserPrincipal)
│   │   ├── mapper/                           # DtoMapper
│   │   └── exception/                        # ApiException, GlobalExceptionHandler
│   ├── src/main/resources/
│   │   ├── application.properties            # PostgreSQL, JWT, CORS, OpenAPI
│   │   └── application-h2.properties         # Optional zero-setup profile
│   └── pom.xml
│
└── questlearn-frontend/                      # React 18 + Vite + Tailwind CSS
    ├── src/
    │   ├── assets/animations/                # Lottie JSON (level-up, streak, trophy)
    │   ├── components/
    │   │   ├── common/                       # Navbar, ProtectedRoute, AnimatedButton
    │   │   ├── skilltree/                    # SkillTreeCanvas, SkillNode (Framer Motion)
    │   │   ├── quiz/                         # QuizPlayer, MCQCard, CodeOrderQuiz, DragDropQuiz
    │   │   └── gamification/                 # XPBar, StreakCounter, LevelUpModal
    │   ├── context/                          # AuthContext.jsx, GamificationContext.jsx
    │   ├── pages/                            # Dashboard, SkillTree, Studio, Admin, Leaderboard
    │   ├── services/api.js                   # Axios instance + JWT interceptors
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

---

## 2. Data Model

```text
users ──1:N── courses ──1:N── modules ──1:1── quizzes
                                  │
                                  └── parent_module_id (self-referencing tree)

users ──1:N── user_module_progress ──N:1── modules
              (unique user_id + module_id, status, score, attempts, completed_at)
```

| Table | Key columns | Notes |
| :--- | :--- | :--- |
| `users` | `email` (unique), `password_hash`, `role`, `total_xp`, `current_level`, `streak_days`, `last_activity_date` | JWT subject is the email |
| `courses` | `title`, `published`, `instructor_id` | Drafts are invisible to students |
| `modules` | `course_id`, `parent_module_id`, `xp_reward`, `position_x/y`, `content JSONB` | `content` holds lesson blocks |
| `quizzes` | `module_id` (unique), `type`, `passing_score`, `payload JSONB` | Payload shape depends on `type` |
| `user_module_progress` | `user_id`, `module_id`, `status`, `score`, `attempts` | Unique pair prevents duplicate rows |

`JSONB` is mapped directly with Hibernate 6's `@JdbcTypeCode(SqlTypes.JSON)` on a `JsonNode` field —
no extra library required. Hibernate's PostgreSQL dialect emits `jsonb`; the H2 profile emits `json`.

---

## 3. Security & Authentication Flow (JWT + RBAC)

1. **Login request** — client sends `POST /api/v1/auth/login` with credentials.
2. **Token issuance** — `AuthService` loads the user, verifies the password with
   `BCryptPasswordEncoder`, and `JwtUtil` signs a token containing `sub` (email), `userId`, `role`
   and `name`.
3. **Request interception** — React's Axios interceptor attaches `Authorization: Bearer <token>` to
   every outbound call; a 401 response automatically clears the session and bounces to `/login`.
4. **Filter** — `JwtAuthenticationFilter` (a `OncePerRequestFilter`) validates the signature and
   expiry, then populates the `SecurityContext` with an `AppUserPrincipal` and a
   `ROLE_<role>` authority. No database call is made per request.
5. **Method-level enforcement** — controllers use `@PreAuthorize("hasRole('INSTRUCTOR')")`,
   `hasAnyRole('STUDENT','ADMIN')`, and so on. Resource ownership (instructor owns the course) is
   checked in the service layer.
6. **Statelessness** — sessions are disabled; there is no server-side session store.
7. **CORS** — restricted to configured origins (`CORS_ORIGINS`, default `http://localhost:5173`).

Admin self-registration is refused: `POST /auth/register` accepts only `STUDENT` or `INSTRUCTOR`.

---

## 4. Gamification Engine Logic

Level calculation (inverse of the XP threshold) lives in `GamificationService`:

$$\text{Level} = \lfloor 0.1 \times \sqrt{\text{Total XP}} \rfloor + 1$$

so `XP(level L) = 100 × (L − 1)²`. Both directions are exposed so the UI can draw a progress bar
without duplicating the curve.

`ProgressService.completeModule` is one `@Transactional` unit:

1. Verify the `user_module_progress` row is **UNLOCKED** — rejects locked and already-completed
   nodes, which prevents duplicate XP farming.
2. Evaluate the quiz server-side. If the score is below `passingScore`, persist the attempt and
   return `passed: false` with `xpGained: 0`.
3. Mark the node **COMPLETED** with score and timestamp.
4. Query children (`parent_module_id == currentNode.id`) and move each from **LOCKED** to
   **UNLOCKED**.
5. Add XP, recalculate `current_level`, update the daily streak
   (same day → unchanged, yesterday → +1, older → reset to 1).
6. Return `XpAwardResponse` (`xpGained`, `newTotalXp`, `newLevel`, `nextLevelXp`, `leveledUp`,
   `unlockedModuleIds`, `streakDays`, …) so the React client can trigger the Lottie celebration.

Enrollment is implicit: the first `GET /courses/{id}/skill-tree` by a student creates progress rows
for every node — roots `UNLOCKED`, the rest `LOCKED`.

---

## 5. Frontend Architecture

- **`AuthContext`** owns the token, the cached user profile, login/register/logout and the
  `questlearn:unauthorized` listener. The session survives reloads via `localStorage`.
- **`GamificationContext`** mirrors live XP/level/streak, animates the XP bar, shows an XP toast and
  opens the `LevelUpModal` (Lottie + `canvas-confetti`) when the API reports a level-up.
- **`ProtectedRoute`** gates routes by authentication and role, redirecting to `/` on a role
  mismatch.
- **`SkillTreeCanvas`** positions nodes from `positionX`/`positionY` on a grid, draws curved SVG
  edges from `parentId` with `pathLength` animation, and delegates state styling to `SkillNode`.
- **`QuizPlayer`** builds the type-specific answer payload and posts it to the completion endpoint;
  it never receives the correct answers.
- **Offline assets** — Lottie JSON, `lucide-react` icons and system fonts only; nothing is fetched
  from a CDN at runtime.

---

## 6. Error Handling

`GlobalExceptionHandler` returns a consistent envelope for every failure:

```json
{
  "timestamp": "2026-11-03T12:00:00Z",
  "status": 409,
  "error": "Conflict",
  "message": "This node is already completed - XP has been awarded",
  "path": "/api/v1/modules/3/complete"
}
```

Validation failures additionally include a `fieldErrors` map. `SecurityConfig` installs JSON
401/403 handlers so unauthenticated fetch calls never receive an HTML login page.

---

## 7. Design Trade-offs

| Decision | Rationale |
| :--- | :--- |
| Server-side quiz scoring | Prevents XP forgery from the browser console |
| JSONB for quizzes and lesson content | New quiz shapes need no migration; still queryable in Postgres |
| Stateless JWT without refresh tokens | Simple academic scope; 24h expiry, re-login on expiry |
| Progress rows created on first tree open | Keeps enrollment implicit, avoids a separate enroll endpoint |
| Optional H2 profile | Lets the project run on a machine without PostgreSQL for evaluation |
