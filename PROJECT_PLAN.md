# Academic Project Execution Plan (`PROJECT_PLAN.md`)

**Project title:** QuestLearn — An Interactive, Gamified Learning Management System
**Timeline:** 6 weeks (sprint-based agile)
**Target hardware:** Windows 10/11, 8GB RAM, local hosting

---

## 1. Project Objectives

Traditional LMS platforms suffer from low student engagement because progress is presented as
static PDF/video lists. QuestLearn applies game-design mechanics — visual skill trees, immediate
micro-feedback, XP progression and animated milestones — while maintaining enterprise-style security
(RBAC + JWT) and relational data integrity.

Success criteria:

- A student can complete a course end-to-end and see XP, level and streak update in real time.
- Locked nodes cannot be played or farmed for XP, even through direct API calls.
- An instructor can author a course, its node graph and its quizzes without touching SQL.
- The whole stack runs on an 8GB laptop with no Docker and no network access during the demo.

---

## 2. Sprint Breakdown & Milestones

| Sprint | Duration | Key deliverables | Milestone check |
| :--- | :--- | :--- | :--- |
| **Sprint 1: Architecture & DB design** | Week 1 | ER diagram, PostgreSQL install, schema, Spring Boot project with memory tuning | Tables created and connected to Spring Boot |
| **Sprint 2: Auth & RBAC security** | Week 2 | Spring Security + JWT filter, register/login APIs, role guards (`STUDENT`, `INSTRUCTOR`, `ADMIN`) | Postman collection passes all auth and role tests |
| **Sprint 3: Skill-tree & XP backend** | Week 3 | Course/module CRUD, `JSONB` quiz storage, transactional XP + node-unlock engine, leaderboard API | Backend awards XP and unlocks child nodes automatically |
| **Sprint 4: Frontend core & dashboards** | Week 4 | React + Vite setup, Tailwind theme, `AuthContext`, role-based routing, instructor course builder UI | Instructors can create courses and nodes from the UI |
| **Sprint 5: Animations & gamification UI** | Week 5 | Framer Motion skill-tree canvas, drag-and-drop quiz, animated XP bar, Lottie badges | End-to-end interactive student playthrough working |
| **Sprint 6: Seeding, testing & viva prep** | Week 6 | Demo data seeder, edge-case testing, memory profiling on 8GB, report and slides | Zero-lag live demonstration on the laptop |

---

## 3. Role-Based Feature Matrix

| Feature / capability | Student | Instructor | Admin |
| :--- | :---: | :---: | :---: |
| View & enrol in skill-tree courses | Yes | Preview | Yes |
| Play interactive modules & quizzes | Yes | Preview only | Yes |
| Earn XP, level up, view global leaderboard | Yes | No | No (leaderboard read-only) |
| Create courses & map skill-tree dependencies | No | Yes | Yes |
| Build custom `JSONB` quizzes | No | Yes | Yes |
| Publish/unpublish own course | No | Yes | Yes (any course) |
| Manage users (change roles) | No | No | Yes |

Implementation notes:

- "Preview" for instructors renders the tree with every node unlocked and does not persist progress.
- XP is only recorded for `STUDENT` and `ADMIN`; `POST /modules/{id}/complete` is guarded by
  `hasAnyRole('STUDENT','ADMIN')`.
- Instructors may publish their own course to keep the demo workflow smooth; admins can publish or
  unpublish any course from the moderation list.

---

## 4. Risk Management & Mitigation (hardware constraints)

- **Risk 1: Out-of-memory freezes during the live demo.**
  - *Mitigation:* package the backend before the presentation (`mvn clean package -DskipTests`) and
    run `java -Xmx512m -jar target/questlearn-1.0.0.jar`. Close the Java IDE completely — it frees
    roughly 1–2.5 GB. Keep the Hikari pool at 5 connections and PostgreSQL `shared_buffers` at 128MB.
- **Risk 2: Offline or unstable Wi-Fi in the college lab.**
  - *Mitigation:* all Lottie JSON, icons and fonts are bundled locally; the frontend fetches nothing
    from a CDN. Run the Vite dev server (or `npm run preview` of the production build) against
    `localhost`.
- **Risk 3: PostgreSQL service not running or credentials unknown during evaluation.**
  - *Mitigation:* the optional `h2` Spring profile boots an embedded database in
    `questlearn-backend/data/`, seeds the same demo data and needs no install. Documented in the
    README.
- **Risk 4: Quiz answer tampering from the browser console.**
  - *Mitigation:* correct answers never leave the server; scoring and XP awards happen inside a
    transactional service method.

---

## 5. Future Scope (for viva / presentation questions)

1. **AI quiz generator** — feed lecture notes to a lightweight LLM API and emit the same `JSONB`
   quiz contract, so no frontend change is required.
2. **Real-time PvP quiz battles** — Spring Boot WebSockets (STOMP) pairing two students on the same
   question set, with a server-authoritative scoreboard.
3. **Adaptive difficulty** — use attempt history in `user_module_progress` to raise or lower quiz
   difficulty per learner.
4. **Instructor analytics** — per-node completion funnels and time-to-clear metrics for course
   tuning.
5. **Refresh tokens & OAuth2** — replace the 24-hour access token with short-lived access plus
   rotating refresh tokens, and add Google/GitHub login.
6. **Certificate generation** — issue a signed completion certificate once every node in a course is
   cleared.

---

## 6. Deliverables

| Deliverable | Location |
| :--- | :--- |
| Backend source | `questlearn-backend/src/main/java/com/questlearn` |
| Frontend source | `questlearn-frontend/src` |
| Architecture document | `ARCHITECTURE.md` |
| Implementation plan | `IMPLEMENTATION_PLAN.md` |
| Setup & API reference | `README.md` |
| Demo data | `config/DataInitializer.java` |
