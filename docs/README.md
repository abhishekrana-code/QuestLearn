# QuestLearn documentation

This directory explains what QuestLearn is, why each part exists, how the pieces fit
together, and what every module and function does. It is written for three readers:

- **A new maintainer** who needs to change code without breaking a flow.
- **An instructor or administrator** who needs to know what a button actually does.
- **A reviewer** who wants evidence that a claim in the UI is backed by server code.

The root [`README.md`](../README.md) stays the quick-start. These pages are the long form.

## The set

| Page | Answers |
| --- | --- |
| [01-overview.md](01-overview.md) | What QuestLearn is for, who uses it, what it deliberately does not do, and the rules of the game (XP, levels, streaks, deadlines). |
| [02-architecture.md](02-architecture.md) | Processes, request lifecycle, data model, security model, configuration map, and the failure modes the design accepts. |
| [03-backend-reference.md](03-backend-reference.md) | Every backend package, class and function, grouped by responsibility, with the reasoning behind the non-obvious ones. |
| [04-frontend-reference.md](04-frontend-reference.md) | Every route, context, hook, service, component and page, and the function of each exported symbol. |
| [05-flows.md](05-flows.md) | End-to-end stories: sign-up, joining a class, clearing a node, the viva, deadlines, roster import, authoring, AI generation, admin work. |
| [06-api.md](06-api.md) | Endpoint-by-endpoint reference: method, path, who may call it, request body, response shape, and the errors that matter. |
| [07-operations-testing.md](07-operations-testing.md) | Build, run, publish, back up, test, observe, and troubleshoot. Includes the CI jobs and the known local limitations. |

## Conventions used here

- **"Node"** means a module on the skill tree. The database table is `modules`; the
  UI calls them nodes because the tree is the metaphor.
- **"Clear"** means complete a node by passing its quiz or its viva.
- **"Staff"** means `INSTRUCTOR` or `ADMIN`. A course can only be managed by its owner
  or an admin.
- Requests and responses are JSON unless the endpoint says `multipart/form-data`.
- Timestamps cross the wire as ISO-8601 UTC instants; the browser renders them in the
  viewer's local time.
- Server-side facts win. Where this documentation and the UI disagree, the code in
  `questlearn-backend` is authoritative.

## Repository at a glance

```
QuestLearn/
├── questlearn-backend/     Spring Boot 3.4.5 · Java 21 · Maven · PostgreSQL 16
│   ├── src/main/java/com/questlearn/
│   │   ├── config/         startup, security, media, mail, scheduling
│   │   ├── controller/     11 REST controllers
│   │   ├── dto/            request and response records
│   │   ├── email/          pluggable delivery (log, SMTP, Resend)
│   │   ├── exception/      ApiException + one global handler
│   │   ├── mapper/         entity → DTO
│   │   ├── model/          JPA entities and enums
│   │   ├── repository/     Spring Data interfaces
│   │   ├── security/       JWT filter, token minting, request tracing
│   │   ├── service/        business rules
│   │   └── util/
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   └── db/migration/   Flyway V1–V14
│   └── src/test/java/      unit + PostgreSQL integration tests
├── questlearn-frontend/    React 18 · Vite 8 · Tailwind 3 · React Router 7
│   ├── src/
│   │   ├── components/     auth, common, deadlines, gamification, quiz, skilltree, studio, viva
│   │   ├── context/        auth, gamification, theme
│   │   ├── hooks/          auto-retry, dialog focus
│   │   ├── pages/          21 route-level screens
│   │   ├── services/       HTTP, media, AI, deadlines, CSV, lesson payloads
│   │   └── utils/
│   └── e2e/                five Playwright specs
├── scripts/                Windows build/publish helpers
├── deploy/                 deployment notes and units
├── .github/workflows/      three-job CI (backend, frontend, e2e)
├── ARCHITECTURE.md         earlier architecture note, still useful
├── AUDIT.md                UX/accessibility review evidence
└── DOCS: this directory
```

## Very short version

A learner opens a course and sees a tree. Root nodes are unlocked; every other node
is locked behind its parent. Opening the tree for the first time creates a progress
row per node. Passing the node's quiz — or its voice/typed viva — marks it complete,
awards the node's XP once, recomputes the level from total XP, advances the daily
streak, and unlocks the children. Instructors build the same tree in a studio, can
add classes (cohorts) with join codes and class-specific deadlines, and can read a
roster and a per-node funnel. Admins manage accounts, roles, demo credentials,
publishing and the server's own telemetry. AI and email are optional: when no key or
provider is configured, the affected feature degrades with an explanation instead of
breaking the rest of the app.
