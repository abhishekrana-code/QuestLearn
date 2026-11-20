# 6. API reference

The backend is a stateless JSON API. This page is the wire contract: method, path,
who may call it, what goes in, what comes back, and the failures that carry a
meaning. The rules behind each endpoint — and the service that enforces them — are
in [03-backend-reference.md](03-backend-reference.md); the user stories that cross
several endpoints are in [05-flows.md](05-flows.md).

## 6.1 Conventions

### Base path and authentication

All application endpoints live under **`/api/v1`**. The browser calls them through
the same origin (`/api/v1/...`), and the Vite dev/preview server proxies `/api` to
the backend, so no host is baked into the frontend build.

Every endpoint except the public ones below requires a bearer token:

```http
Authorization: Bearer <jwt>
```

The JWT is minted by `POST /auth/login`, `/auth/register` and `PATCH /auth/password`.
It carries the user id, email, role and a token version. The server re-reads the
user row on every request, so a role change, a password reset or a revoked session
takes effect on the next call without waiting for the token to expire.

**Public** (no token):

- `POST /auth/register`, `POST /auth/login`
- `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`
- `POST /auth/verify-email`
- `GET /api/v1/media/videos/{name}` (the name is a random capability)
- `PUT /api/v1/media/uploads/{name}` (the URL signature is the credential)
- `OPTIONS /**`, `/actuator/health`, `/v3/api-docs/**`, `/swagger-ui/**`

Everything else is at least authenticated. Method-level rules narrow that further.
The role names used below are:

| Label | Allowed roles |
| --- | --- |
| **Any** | Any signed-in account |
| **Student** | `STUDENT` |
| **Staff** | `INSTRUCTOR` or `ADMIN` |
| **Admin** | `ADMIN` |
| **Student/Admin** | `STUDENT` or `ADMIN` |

Staff endpoints also apply **ownership**: a course may only be managed by its own
instructor or an admin. The role list is necessary but not sufficient.

### Request and response formats

- JSON in, JSON out, except the two multipart uploads and the raw media PUT.
- Send `Content-Type: application/json` for JSON bodies. The multipart endpoints
  reject a JSON body with `415` and explain the expected type.
- Timestamps are ISO-8601 UTC instants. A `datetime-local` value is converted by
  the browser before it is sent; the API never accepts a local wall-clock string.
- `204 No Content` responses have no body. A `302 Found` is used only by S3 video
  playback.
- Response bodies are not wrapped in an envelope. A collection endpoint returns a
  JSON array; a single resource returns the object.
- Responses carry `X-Request-Id`. The same id is in error bodies and in the server
  log, which is what makes a support report traceable.

### Error shape

Failures return a JSON object:

```json
{
  "timestamp": "2026-11-17T09:14:03.221Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Enter a valid email address",
  "path": "/api/v1/auth/register",
  "requestId": "4f1c9e0a7b2d"
}
```

Validation failures add a `fieldErrors` map (field → first message). `message` is
the first field error, so a client that only shows one sentence still says
something useful:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Password must be between 8 and 72 characters",
  "fieldErrors": { "password": "Password must be between 8 and 72 characters" }
}
```

The security filter's own 401/403 bodies use the same keys but omit `timestamp`.
Internal exception text is never returned; an unexpected failure is logged and
answered with a generic sentence plus the request id.

### Status codes that matter

| Status | Meaning here |
| --- | --- |
| `200` | Success with a body. |
| `201` | A resource was created (registration, course, node, AI draft, direct upload). |
| `202` | Accepted: a reset/confirmation message was queued. The body is a `message`. |
| `204` | Success with no body (leave, delete, clear deadline, password reset confirm). |
| `302` | S3 playback redirect to a short-lived signed URL. |
| `400` | Validation, malformed JSON, unreadable quiz payload, node not attemptable yet. |
| `401` | No/invalid/expired token, bad credentials, or a deleted account. |
| `403` | Signed in but wrong role, not the course owner, locked node, or closed sign-up. |
| `404` | Unknown id, unknown class, unknown node in this course. |
| `409` | Duplicate account (email already registered). |
| `413` | Viva recording above the transcription limit, or a multipart body above the transport limit. |
| `415` | JSON sent to a multipart endpoint, or the reverse. |
| `429` | Login lockout, reset/verification mail throttle, AI quota, or too many concurrent vivas. |
| `502` | Groq answered but the upstream call failed. |
| `503` | AI is not configured (no Groq key). |

### Enumerations on the wire

| Name | Values |
| --- | --- |
| `Role` | `STUDENT`, `INSTRUCTOR`, `ADMIN` |
| `ProgressStatus` | `LOCKED`, `UNLOCKED`, `COMPLETED` |
| `QuizType` | `MULTIPLE_CHOICE`, `CODE_ORDER`, `DRAG_DROP` |
| `AttemptSource` | `QUIZ`, `VIVA_SPOKEN`, `VIVA_WRITTEN` |
| `DeadlineState` | `UPCOMING`, `DUE_SOON`, `OVERDUE`, `COMPLETED`, `COMPLETED_LATE` |

## 6.2 Endpoint index

| Method | Path | Who | Success |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | 201 `AuthResponse` |
| POST | `/auth/login` | public | 200 `AuthResponse` |
| GET | `/auth/me` | any | 200 `UserDto` |
| POST | `/auth/password-reset/request` | public | 202 `{ message }` |
| POST | `/auth/password-reset/confirm` | public | 204 |
| POST | `/auth/verify-email` | public | 200 `{ message }` |
| POST | `/auth/verify-email/resend` | any | 202 `{ message }` |
| PATCH | `/auth/password` | any | 200 `AuthResponse` |
| PATCH | `/auth/notification-preferences` | any | 200 `UserDto` |
| GET | `/courses` | any | 200 `CourseDto[]` |
| GET | `/courses/mine` | any | 200 `CourseDto[]` |
| GET | `/courses/{courseId}` | any | 200 `CourseDto` |
| POST | `/courses/{courseId}/enroll` | student | 200 `CourseDto` |
| DELETE | `/courses/{courseId}/enroll` | student | 204 |
| POST | `/courses` | staff | 201 `CourseDto` |
| PUT | `/courses/{courseId}` | staff | 200 `CourseDto` |
| PATCH | `/courses/{courseId}/publish` | staff | 200 `CourseDto` |
| PATCH | `/courses/{courseId}/archive` | staff | 200 `CourseDto` |
| PATCH | `/courses/{courseId}/members-only` | staff | 200 `CourseDto` |
| POST | `/courses/{courseId}/duplicate` | staff | 201 `CourseDto` |
| DELETE | `/courses/{courseId}` | staff | 204 |
| GET | `/courses/{courseId}/roster` | staff | 200 `CourseRosterDto` |
| POST | `/courses/{courseId}/roster/import` | staff | 200 `RosterImportResult` |
| GET | `/courses/{courseId}/roster/{userId}` | staff | 200 `RosterLearnerDetailDto` |
| POST | `/courses/{courseId}/modules` | staff | 201 node summary |
| PUT | `/modules/{moduleId}` | staff | 200 node summary |
| POST | `/modules/{moduleId}/quiz` | staff | 200 quiz summary |
| GET | `/courses/{courseId}/skill-tree` | any | 200 `SkillTreeDto` |
| GET | `/modules/{moduleId}` | any | 200 `ModuleDetailDto` |
| GET | `/me/next` | any | 200 `NextNodeDto` or 204 |
| POST | `/modules/{moduleId}/complete` | student/admin | 200 `XpAwardResponse` |
| GET | `/leaderboard` | student/admin | 200 `LeaderboardEntry[]` |
| GET | `/leaderboard/overall` | student/admin | 200 `OverallLeaderboardEntry[]` |
| GET | `/courses/{courseId}/leaderboard` | any | 200 `CourseLeaderboardEntry[]` |
| GET | `/me/deadlines` | any | 200 `DeadlineOverviewDto` |
| PUT | `/courses/{courseId}/modules/{moduleId}/deadline` | staff | 200 `DeadlineDto` |
| DELETE | `/courses/{courseId}/modules/{moduleId}/deadline` | staff | 204 |
| GET | `/courses/{courseId}/cohorts/{cohortId}/deadlines` | staff | 200 `DeadlineDto[]` |
| PUT | `/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | staff | 200 `DeadlineDto` |
| DELETE | `/courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | staff | 204 |
| GET | `/courses/{courseId}/cohorts` | staff | 200 `CohortDto[]` |
| POST | `/courses/{courseId}/cohorts` | staff | 200 `CohortDto` |
| DELETE | `/cohorts/{cohortId}` | staff | 204 |
| POST | `/cohorts/join` | student | 200 `CohortJoinResponse` |
| GET | `/courses/{courseId}/announcements` | any | 200 `AnnouncementDto[]` |
| POST | `/courses/{courseId}/announcements` | staff | 200 `AnnouncementDto` |
| GET | `/announcements` | student | 200 `AnnouncementFeedPage` |
| GET | `/announcements/unread-count` | student | 200 `{ unread }` |
| POST | `/announcements/read-all` | student | 200 `{ marked }` |
| POST | `/announcements/{announcementId}/read` | any | 204 |
| GET | `/courses/{courseId}/announcements/receipts` | staff | 200 `AnnouncementReceiptSummaryDto[]` |
| GET | `/announcements/{announcementId}/receipts` | staff | 200 `AnnouncementReceiptsDto` |
| DELETE | `/announcements/{announcementId}` | staff | 204 |
| GET | `/courses/{courseId}/materials` | any viewer | 200 `CourseMaterialDto[]` |
| POST | `/courses/{courseId}/materials` (multipart) | staff, owner or admin | 201 `CourseMaterialDto` |
| DELETE | `/courses/{courseId}/materials/{materialId}` | staff, owner or admin | 204 |
| POST | `/courses/{courseId}/materials/ask` | any viewer | 200 `MaterialAnswerDto` |
| POST | `/modules/{moduleId}/video` | staff | 200 `VideoAttachmentDto` |
| POST | `/modules/{moduleId}/video/upload-ticket` | staff | 200 `VideoUploadTicketDto` |
| POST | `/modules/{moduleId}/video/attachments` | staff | 200 `VideoAttachmentDto` |
| PUT | `/modules/{moduleId}/video-url` | staff | 200 `VideoAttachmentDto` |
| DELETE | `/modules/{moduleId}/video` | staff | 200 `VideoAttachmentDto` |
| POST | `/modules/{moduleId}/viva` (multipart) | student/admin | 200 `VivaGradeResponse` |
| POST | `/modules/{moduleId}/viva` (JSON) | student/admin | 200 `VivaGradeResponse` |
| GET | `/ai/status` | any | 200 status object |
| POST | `/ai/courses` | staff | 201 `GeneratedCourseDto` |
| GET | `/courses/{courseId}/analytics` | staff | 200 `CourseAnalyticsDto` |
| GET | `/admin/users` | admin | 200 `AdminUserPage` |
| PATCH | `/admin/users/{userId}/role` | admin | 200 `UserDto` |
| DELETE | `/admin/users/{userId}` | admin | 204 |
| POST | `/admin/users/{userId}/reset-password` | admin | 200 `TempPasswordResponse` |
| DELETE | `/admin/users/{userId}/modules/{moduleId}/progress` | staff | 200 `UserDto` |
| GET | `/admin/audit` | admin | 200 `AuditEntryDto[]` |
| GET | `/admin/demo-password` | admin | 200 `DemoPasswordStatus` |
| POST | `/admin/demo-password/rotate` | admin | 200 `DemoPasswordRotation` |
| GET | `/admin/stats` | admin | 200 `AdminStatsDto` |
| GET | `/admin/telemetry` | admin | 200 `AdminTelemetryDto` |
| PUT | `/media/uploads/{name}` | public (signed) | 201 |
| GET | `/media/videos/{name}` | public | 200 file (disk) / 302 (S3) |

## 6.3 Authentication and profile — `/api/v1/auth`

### Shared bodies

`UserDto` is the account view returned by login, registration, `/auth/me`,
notification preferences and the admin endpoints:

```text
id, name, email, role,
emailVerified, notifyDeadlines,
totalXp, currentLevel, streakDays, lastActivityDate, nextLevelXp
```

`AuthResponse` is `{ token, tokenType: "Bearer", expiresInMs, user: UserDto }`.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `POST /auth/register` | `{ name, email, password, role?, inviteCode? }` | Creates a student by default. `ADMIN` is always refused. `INSTRUCTOR` needs the configured invite code; student sign-up needs the institution code when the deployment requires one. Email is normalised to lower case. Returns 201 with a token. 403 when sign-up is closed or the code is wrong; 409 when the email exists; 400 on field validation. |
| `POST /auth/login` | `{ email, password }` | 200 `AuthResponse`. Wrong credentials are a uniform 401 `Invalid email or password`. Five failures lock that email for 15 minutes by default, answered with 429. The lock is per running instance. |
| `GET /auth/me` | — | Current `UserDto`, including live XP, level, streak and next-level threshold. A deleted account is 401. |
| `POST /auth/password-reset/request` | `{ email }` | 202 with the same message whether or not the address exists. A single-use link is mailed; the token expires after 30 minutes by default. 429 after three requests for one address in a rolling hour. |
| `POST /auth/password-reset/confirm` | `{ token, password }` | 204. Consumes the token, stores the new hash and revokes other sessions. 400 for an expired/invalid token, a reused token, or a password equal to the current one. |
| `POST /auth/verify-email` | `{ token }` | 200 `{ message }`. Public because the link may be opened signed out. 400 for an invalid/expired token; a second confirmation says it is already confirmed. |
| `POST /auth/verify-email/resend` | — | 202 with the expiry sentence. Only an unconfirmed address may ask; 429 after the hourly limit. |
| `PATCH /auth/password` | `{ currentPassword, newPassword }` | 200 `AuthResponse`. Verifies the current password, rotates the hash, increments the token version (all other sessions are dead) and returns a fresh token for this browser. 400 when the current password is wrong or the new one is unchanged. |
| `PATCH /auth/notification-preferences` | `{ deadlineEmails: boolean }` | 200 `UserDto`. Sets the daily digest preference; it follows the account between devices. |

The registration response signs the user in immediately. Verification is soft: the
account works before the address is confirmed, and the dashboard banner is the only
reminder.

## 6.4 Courses, nodes and authoring

### `CourseDto`

```text
id, title, description, category, emoji, published,
instructorId, instructorName,
moduleCount, completedModules, enrolledCount,
enrolled, membershipRequired,
createdAt, archivedAt
```

`completedModules` is the signed-in learner's cleared count; `enrolled` says whether
they joined; `membershipRequired` says whether a class code is needed.

### Catalogue and enrolment

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses` | — | What this role may see. Admin gets everything; an instructor gets published courses plus their own drafts and archives; a student gets published, non-members-only courses, plus any gated course they already joined. Ordered by id. |
| `GET /courses/mine` | — | A student's joined, published, non-archived courses. Staff receive their normal list. |
| `GET /courses/{courseId}` | — | One course after the same visibility check. 403 when a student asks for a draft, a members-only course they have not joined, or an archived course; 404 when it does not exist. |
| `POST /courses/{courseId}/enroll` | — | Idempotent. 200 with the course; a second click is not an error. 403 for a non-student, a members-only course without a class code, an unpublished course, or an archived one. |
| `DELETE /courses/{courseId}/enroll` | — | 204. Removes the roster row only; progress and attempts are kept, so rejoining resumes. 403 for a non-student. |

### Authoring

All of these are **staff** and additionally owner-or-admin.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `POST /courses` | `{ title, description?, category?, emoji?, published? }` | 201. A course created by an instructor is always a private draft; only an admin may set `published: true` at creation. Emoji defaults to 🗺️. Title is required; lengths are capped by the DTO. |
| `PUT /courses/{courseId}` | `{ title, description?, category?, emoji? }` | 200. Edits the four display fields only. Blank description/category become null. Nodes, quizzes and video have their own endpoints. |
| `PATCH /courses/{courseId}/publish?published=` | query boolean | 200. Publishes or unpublishes. Publishing an archived course is 400 ("Restore the course before publishing it"). Audited. |
| `PATCH /courses/{courseId}/archive?archived=` | query boolean | 200. Archiving also unpublishes, so every student query stops showing it. Restoring leaves it a draft on purpose. Audited. |
| `PATCH /courses/{courseId}/members-only?membersOnly=` | query boolean | 200. On: the course leaves the catalogue and only a class code admits a student. Off: back in the catalogue. |
| `POST /courses/{courseId}/duplicate` | — | 201. Copies the tree, quizzes and positions into an unpublished draft owned by the caller, titled "(copy)". |
| `DELETE /courses/{courseId}` | — | 204. Must be unpublished and must have no student progress; otherwise 400 with the reason. Videos are deleted from storage after the rows. Audited. |
| `POST /courses/{courseId}/modules` | `{ title, summary?, content?, xpReward?, positionX?, positionY?, orderIndex?, parentModuleId? }` | 201 with `{ id, title, xpReward, parentModuleId, positionX, positionY, orderIndex }`. XP defaults to 100, coordinates to `(0, orderIndex)`, order to the current node count, parent to none. A parent from another course is 400. |
| `PUT /modules/{moduleId}` | `{ title, summary?, content?, xpReward? }` | 200 with `{ id, title, summary, xpReward }`. Replaces the lesson prose but preserves `videoUrl`/`videoLabel`, so saving a lesson cannot delete an attached film. |
| `POST /modules/{moduleId}/quiz` | `{ type, passingScore?, payload }` | 200 with `{ id, moduleId, type, passingScore }`. Passing score defaults to 60. The payload is validated before saving; an invalid shape is 400 with the specific rule. Attaching again replaces the node's one quiz. |

### Quiz payloads

The stored shapes, and therefore the shapes an instructor posts:

```json
// MULTIPLE_CHOICE
{ "questions": [
  { "id": "q1", "prompt": "Which hook runs after render?",
    "options": ["useEffect", "useState"], "correctIndex": 0,
    "explanation": "Effects run after the commit." }
] }

// CODE_ORDER
{ "prompt": "Put the steps in order.",
  "lines": ["first line", "second line"], "explanation": "..." }

// DRAG_DROP
{ "prompt": "Match each term to its meaning.",
  "pairs": [{ "left": "JWT", "right": "A signed token" }] }
```

Validation rules: at least one question with a prompt and two options for multiple
choice; `correctIndex` must point at an option; at least two lines for code order;
at least two complete left/right pairs for drag-drop.

What the learner receives is **sanitised**: `correctIndex` and every `explanation`
are removed, and code-order lines are scrambled, so the browser never holds the
answer key. Explanations come back in the completion response after grading.

### Roster and import

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses/{courseId}/roster` | query `cohortId?`, `nodeId?`, `nodeCleared?` | 200 `CourseRosterDto`. Narrows to one class, and/or to learners who have cleared (`true`) or not cleared (`false`) one node. Unknown class or a class from another course is 404. |
| `POST /courses/{courseId}/roster/import` | `{ emails: string[], cohortId? }` | 200 `{ imported, alreadyMember, unknown }`. Matches existing accounts only; it never creates one. At most 500 addresses; an empty list is 400. When `cohortId` is given the matched learners also join that class. |
| `GET /courses/{courseId}/roster/{userId}` | — | 200 `RosterLearnerDetailDto`: every node and the full attempt trail for one learner. 404 when that learner is not enrolled. |

`CourseRosterDto`:

```text
courseId, title, moduleCount,
nodes: [{ id, title }],
learners: [{
  userId, name, email, totalXp, currentLevel, streakDays,
  clearedNodes, moduleCount, enrolledAt, lastActivity,
  nodes: [{ moduleId, title, status, score, attempts, completedAt }]
}]
```

`RosterLearnerDetailDto` adds `courseTitle` and replaces the compact node rows with
`LearnerNodeDto` rows that carry `history: [{ score, passed, source, at }]`.

## 6.5 Progression, XP and leaderboards

### `SkillTreeDto` and `SkillNodeDto`

```text
SkillTreeDto:
  courseId, courseTitle, courseDescription, category, emoji,
  totalModules, completedModules, totalXp, level,
  nodes: [SkillNodeDto]

SkillNodeDto:
  id, title, summary, xpReward, parentId,
  positionX, positionY, orderIndex,
  status, score, attempts, quizType,
  videoUrl, videoLabel, dueAt, deadlineState
```

`status` is the **learner's** state, not a property of the course: a root node is
`UNLOCKED`, a child unlocks when its parent is `COMPLETED`, and a cleared node is
`COMPLETED`. Staff previewing the tree see the same statuses computed for their own
account.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses/{courseId}/skill-tree` | — | 200. Opening the tree also creates any missing progress rows for the learner, which is why a node attempt requires visiting the tree first. Visibility is checked. |
| `GET /modules/{moduleId}` | — | 200 `ModuleDetailDto`: lesson sections, takeaways, video, quiz (sanitised), viva config, the learner's status/score/attempts, deadline, and the newest 10 attempts. Instructors get an empty history because they are previewing. 404 for an unknown node; 403 when the course is not visible. |
| `GET /me/next` | — | 200 `NextNodeDto` or **204** when nothing is open. The server picks the next unlocked, unfinished node across the learner's courses. |
| `POST /modules/{moduleId}/complete` | `{ answers: AnswerRequest[] }` (body optional) | 200 `XpAwardResponse`. Requires an existing progress row and an `UNLOCKED`/`COMPLETED` node. `AnswerRequest` is `{ questionId, selectedIndex?, order?, matches? }`. |

`ModuleDetailDto`:

```text
id, courseId, courseTitle, title, summary, content, xpReward,
status, score, attempts,
quiz: { id, type, passingScore, payload },
viva: { bossName, openingQuestion, topics[], passThreshold, maxHp },
history: [{ score, passed, source, at }],
dueAt, deadlineState
```

`XpAwardResponse`:

```text
xpGained, newTotalXp, newLevel, nextLevelXp, leveledUp,
score, passed, unlockedModuleIds[],
streakDays, streakIncremented, message, explanations[]
```

Completion rules the client can rely on:

- A node with no quiz scores 100 and completes; a quiz node is graded against the
  stored payload.
- A failing attempt is still recorded, returns `passed: false`, awards no XP and
  does not unlock children.
- The **best** score is kept. A retake of a completed node returns `passed: true`,
  `xpGained: 0`, and the "no extra XP" message.
- XP is awarded once per node. Level is derived from total XP
  (`floor(0.1 × sqrt(XP)) + 1`); the next-level threshold is `100 × (level − 1)²`.
- A pass marks the node complete, unlocks children and advances the streak. A 403
  means the node is still locked; a 400 means the tree was never opened.

### Leaderboards

| Endpoint | Request | Behaviour |
| --- | --- | --- |
| `GET /leaderboard` | — | Top 10 students by lifetime `totalXp`. `LeaderboardEntry`: `rank, userId, name, totalXp, currentLevel, streakDays, modulesCleared, currentUser`. |
| `GET /leaderboard/overall` | — | Top 10 by XP actually earned from cleared nodes, not account XP. `OverallLeaderboardEntry`: `rank, userId, name, combinedXp, nodesCleared, coursesCleared, currentLevel, streakDays, currentUser, topCourses[{ courseId, title, xp }]`. |
| `GET /courses/{courseId}/leaderboard` | query `cohortId?` | Top 10 inside one course (or one class), ranked by XP earned there. `CourseLeaderboardEntry`: `rank, userId, name, courseXp, currentLevel, streakDays, modulesCleared, moduleCount, currentUser`. |

`currentUser` is how the page rings the viewer's row without guessing by id. A
teacher may read a course board for a class they teach; course visibility is still
checked.

## 6.6 Deadlines

Deadlines are **advisory**. No completion endpoint consults them, and late work is
accepted and labelled, never blocked.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /me/deadlines` | — | 200 `DeadlineOverviewDto`: `{ deadlines: DeadlineDto[], deadlineEmailsEnabled }`, soonest first. Covers the learner's enrolled courses with the class override already resolved. |
| `PUT /courses/{courseId}/modules/{moduleId}/deadline` | `{ dueAt: ISO instant }` | 200 `DeadlineDto`. Sets or moves the course-wide date. 404 when the node is not part of that course. |
| `DELETE /courses/{courseId}/modules/{moduleId}/deadline` | — | 204. Makes the node self-paced. |
| `GET /courses/{courseId}/cohorts/{cohortId}/deadlines` | — | 200 array of that class's overrides only. |
| `PUT /courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | `{ dueAt }` | 200. Gives one class its own date for one node. |
| `DELETE /courses/{courseId}/cohorts/{cohortId}/modules/{moduleId}/deadline` | — | 204. Drops the override so the course date applies again. |

`DeadlineDto`:

```text
moduleId, moduleTitle, courseId, courseTitle, courseEmoji,
dueAt, xpReward, state, completedAt
```

A class override beats the course-wide date; if several overrides apply, the
**earliest** wins. `state` is computed by the server: `DUE_SOON` inside the
configured window (7 days by default), `OVERDUE` after the instant, `COMPLETED` or
`COMPLETED_LATE` from the learner's completion time. The browser renders the local
date but never decides lateness.

## 6.7 Classes (cohorts)

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses/{courseId}/cohorts` | — | 200 `CohortDto[]`: `{ id, courseId, name, joinCode, memberCount, createdAt }`. |
| `POST /courses/{courseId}/cohorts` | `{ name }` | 200 with the new class and its join code. Name required, at most 120 characters. |
| `DELETE /cohorts/{cohortId}` | — | 204. Removes the grouping and the announcements addressed to it; members keep the course and their progress. |
| `POST /cohorts/join` | `{ code }` | 200 `CohortJoinResponse`: `{ cohortId, cohortName, courseId, courseTitle, alreadyMember }`. Adds the student to the class **and** enrols them in the course in one transaction. 404 for an unknown code; 403 for a non-student, an unpublished course, or an archived one. |

A class code is not a password for the course's content: it is an invitation that
performs two memberships at once. A student who is already in the class gets
`alreadyMember: true` instead of a duplicate row.

## 6.8 Announcements

A teacher's note to a course, or to one class inside it. This is an **in-app**
channel: nothing is emailed, so the dashboard banner, the student notices page and
the studio panel are the only places a note appears.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses/{courseId}/announcements` | — | 200 `AnnouncementDto[]`, newest first. Staff who manage the course see every note with the class it names; a learner must be enrolled on a published, non-archived course and receives the course-wide notes plus the notes for their own classes only. |
| `POST /courses/{courseId}/announcements` | `{ body, cohortId? }` | 200 `AnnouncementDto`. **Staff** and owner-or-admin. `body` is trimmed; blank is 400 and the length cap is 2000 characters. `cohortId` omitted (or `null`) addresses the whole course; an unknown class, or one from another course, is 404. The author's own read row is written, so the note is not unread for them. |
| `GET /announcements` | `page?`, `size?`, `courseId?`, `unread?` | 200 `AnnouncementFeedPage`, **students only**. Every visible note across the learner's courses, newest first, without a request per course. `size` is clamped to 50. An archived or unpublished course is skipped, not refused. `courseId` outside the learner's courses returns an empty page. |
| `GET /announcements/unread-count` | — | 200 `{ unread }`, students only. The same audience as the feed, counted without paging. |
| `POST /announcements/read-all` | — | 200 `{ marked }`, students only. Marks the notes the feed would show and nothing else; already-read notes are left alone. |
| `POST /announcements/{announcementId}/read` | — | 204, idempotent. The note must be one the caller may read: staff who manage the course, or an enrolled learner on a live course, and for a class note that learner must be in the class. A second call, including one racing from another tab, keeps the first read time. |
| `GET /courses/{courseId}/announcements/receipts` | — | 200 `AnnouncementReceiptSummaryDto[]`, **staff** and owner-or-admin. One row per note in the course with `{ announcementId, recipients, read, readPercent }`. Recipients are the current audience, and reads are intersected with it. |
| `GET /announcements/{announcementId}/receipts` | `status?` (`unread`\|`read`\|`all`), `page?`, `size?` | 200 `AnnouncementReceiptsDto`, **staff** and owner-or-admin. The counts cover the whole audience; `rows` are paged and sorted by name, with `readAt: null` for a learner who has not read it. Names only, never addresses. |
| `DELETE /announcements/{announcementId}` | — | 204. **Staff** and owner-or-admin of the note's course. 404 for an unknown id. A deleted author does not delete the note; the row stays with `authorName: null`. |

`AnnouncementDto`:

```text
id, courseId, cohortId, cohortName, authorName, body, createdAt, read
```

`cohortId` and `cohortName` are null for a course-wide note. `read` is the
caller's own state, not a property of the note.

`AnnouncementFeedPage`:

```text
announcements: [{ id, courseId, courseTitle, courseEmoji, cohortId, cohortName,
                  authorName, body, createdAt, read }],
unreadCount, total, page, size, totalPages
```

`unreadCount` covers every visible note, not just the returned page. The feed
resolves the audience once per course and per class, then filters and pages the
result in memory, which is bounded by the notes on the learner's own courses.

Reading failures keep the existing vocabulary: a non-owner instructor, an
unenrolled student, an unpublished course and an archived course are all **403**
with a distinct message, and an unknown course is **404**. The class filter is
applied on the server, so a learner in 10B never receives a note written for 10C.

## 6.9 Lesson video

Video bytes never pass through the application server in the normal flow. The
browser asks for a ticket, uploads directly, then records the object.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `POST /modules/{moduleId}/video` | multipart, part `file` | 200 `VideoAttachmentDto`. Legacy/direct path: the server receives the file and streams it to storage. 400 for an empty file, a disallowed name/type, or a file over the size limit. |
| `POST /modules/{moduleId}/video/upload-ticket?filename=` | query filename optional | 200 `VideoUploadTicketDto`: `{ name, uploadUrl, method, headers, mediaUrl, expiresAt, maxBytes }`. The upload URL is signed and expires (15 minutes by default). |
| `POST /modules/{moduleId}/video/attachments` | `{ name, label? }` | 200 `VideoAttachmentDto`. Confirms which object arrived and points the node at it. |
| `PUT /modules/{moduleId}/video-url` | `{ url, label? }` | 200. Attaches externally hosted video. The URL must start with `http://` or `https://` and parse as a web address. |
| `DELETE /modules/{moduleId}/video` | — | 200 `VideoAttachmentDto` with the video fields cleared. |

`VideoAttachmentDto` is `{ moduleId, videoUrl, videoLabel, content }`; the node's
lesson content is returned so the studio can update in place without a refetch.
Every endpoint here is **staff** and owner-or-admin.

### Raw media endpoints (public)

| Endpoint | Behaviour |
| --- | --- |
| `PUT /api/v1/media/uploads/{name}?expires=&signature=` | Disk-mode direct upload. 201. The signature and expiry in the URL are the credential; the body is the raw bytes. No bearer token is needed (the browser's upload request carries none). A disallowed filename or an empty/oversized file is 400; a missing, tampered or expired signature is 403. |
| `GET /api/v1/media/videos/{name}` | Disk mode: served by a static resource handler. S3 mode: `302` to a short-lived signed GET with `Cache-Control: no-store`, or `404` when the object/name is unknown. The capability is the random name. |

Deleting or replacing a video removes the stored object. Uploaded files live on disk
(`./uploads/videos` by default), not in the database, so they need their own backup.

## 6.10 Viva

Two shapes of the same attempt. Both return `VivaGradeResponse` and share grading,
XP, unlocks and history.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `POST /modules/{moduleId}/viva` | `multipart/form-data`, part `audio` | Transcribes with Groq Whisper (audio is never stored), then grades. 400 for an empty/unreadable/short recording, a transcript too short to judge, a node whose tree was never opened, or a written answer outside 15–4000 characters. 403 for a locked node, an instructor, or an invisible course. 413 when the recording exceeds the transcription limit. 429 when all viva permits are in use. |
| `POST /modules/{moduleId}/viva` | `{ answer }` JSON | The typed fallback. Same grader, pass mark, XP and unlocks. |

`VivaGradeResponse`:

```text
moduleId, input, transcript, score, passThreshold, passed,
verdict, strengths[], gaps[], feedback, followUpQuestion,
attempts, xpGained, newTotalXp, newLevel, nextLevelXp, leveledUp,
streakDays, streakIncremented, unlockedModuleIds[], message
```

The default pass mark is 70 and boss HP is 100. A failed answer is a stored attempt
with feedback, so the learner can retry; it awards nothing. A pass follows the same
once-only XP rule as a quiz. `input` distinguishes `SPOKEN` from `WRITTEN`; the
history records `VIVA_SPOKEN` or `VIVA_WRITTEN` accordingly.

Without a Groq key the endpoint answers **503** with a configuration message. An
upstream failure is **502**; a rate-limited model is **429**. The permit pool
(`AI_MAX_CONCURRENT_VIVAS`, default 4) fails fast instead of queueing, because a
student watching a spinner cannot tell "busy" from "broken".

## 6.11 AI authoring

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /ai/status` | — | `{ configured, reasoningModel, transcriptionModel, hourlyLimit }`. Lets the studio show an honest unavailable card before the teacher types a prompt. |
| `POST /ai/courses` | `{ topic, audience?, category?, nodeCount? }` | 201 `GeneratedCourseDto`. Topic required, at most 300 characters; node count 3–8. Creates an unpublished draft course with linked nodes, lessons and quizzes, owned by the caller. |

`GeneratedCourseDto`:

```text
courseId, title, description, category, emoji, nodeCount,
nodes: [{ id, title, xpReward, parentId, quizType }],
warnings: string[]
```

Warnings name generated quizzes that failed validation and were dropped, so the
teacher knows which nodes still need a quiz. Generation is quota-limited per account
per rolling hour (30 by default) and per deployment per calendar day (150); exceeding
either is **429**. The quota is in memory.

## 6.12 Course materials (VerityAI)

Readings belong to a course; the PDF itself is processed by a separate VerityAI
service. Full design in [08-verityai-integration.md](08-verityai-integration.md).

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /courses/{courseId}/materials?refresh=` | — | 200 `CourseMaterialDto[]`, newest first. `refresh=true` re-reads unfinished rows from VerityAI; a failure there leaves the last known status. View permission on the course is required. |
| `POST /courses/{courseId}/materials` | multipart `file` | 201 `CourseMaterialDto`. Owner-instructor or admin. PDF-only by name and `%PDF-` signature, 25 MB and 20-per-course defaults. 400 for the wrong file, 429 when VerityAI's queue is full, 503 when the service is not configured. |
| `DELETE /courses/{courseId}/materials/{materialId}` | — | 204. Owner-instructor or admin. The VerityAI document is removed before the row; `404` from VerityAI means the document is already gone. |
| `POST /courses/{courseId}/materials/ask` | `{ question }` | 200 `MaterialAnswerDto`. View permission. Only `READY` materials are sent; 400 with an explanation when none are ready. Each question consumes one AI quota unit, so 429 applies. |

`CourseMaterialDto`:

```text
id, filename, sizeBytes, status, errorMessage, createdAt
```

`status` is `UPLOADED`, `PROCESSING`, `READY` or `FAILED` — VerityAI's lifecycle.

`MaterialAnswerDto`:

```text
answer, evidenceStatus,
citations: [{ materialId, documentName, pageNumber, excerpt }]
```

`evidenceStatus` is `SUFFICIENT`, `INSUFFICIENT` or `NONE`. `materialId` is
QuestLearn's row id; it is null only if VerityAI cited a document outside the ids
QuestLearn sent, which the UI then renders without a local link.

A 503 with "Course materials are not configured on this server." means
`VERITY_ENABLED` or the service credentials are missing; it is not a database or
course-permission failure.

## 6.13 Analytics

`GET /courses/{courseId}/analytics?cohortId=` — **staff**, owner-or-admin.

200 `CourseAnalyticsDto`:

```text
courseId, courseTitle, cohortId, cohortName,
learners, started, finished,
nodes: [{
  moduleId, title, orderIndex,
  reached, started, cleared, attempts, medianHoursToClear
}],
dropOff: NodeFunnelDto | null
```

`reached` is how many learners could see the node (its prerequisite was cleared),
`started` how many attempted it, `cleared` how many passed. `dropOff` is the node
with the largest reached-minus-cleared gap, already computed by the server so every
client names the same teaching target. An unknown class, or one from another course,
is 404.

## 6.14 Administration - `/api/v1/admin`

Every endpoint in this group is **admin** except the node-progress reset, which is
**staff** and limited to the teacher's own course.

| Endpoint | Request | Behaviour and failures |
| --- | --- | --- |
| `GET /admin/users?query=&page=0&size=25` | optional search/paging | 200 `AdminUserPage`: `{ users: UserDto[], total, page, size, totalPages }`. Search matches name or email, case-insensitive. `size` is clamped to 1–100; page is clamped at 0; order is by ascending id so pages do not shuffle. |
| `PATCH /admin/users/{userId}/role` | `{ role }` | 200 `UserDto`. 400 when an admin targets themselves. The change is live on the target's next request because the JWT filter re-reads the row. Audited. |
| `DELETE /admin/users/{userId}` | — | 204. Refuses self-deletion, the last admin, and an instructor who still owns a course (400, with the reason). Progress and attempts are removed first, then enrolments and the account. Audited. |
| `POST /admin/users/{userId}/reset-password` | — | 200 `TempPasswordResponse`: `{ userId, email, temporaryPassword }`. The value is shown once and stored only as a hash; existing sessions are revoked. Audited. |
| `DELETE /admin/users/{userId}/modules/{moduleId}/progress` | — | 200 `UserDto` for the learner. Removes every attempt on that node and the XP awarded for it, so the node can be retried from scratch. Other nodes are untouched. 403 if the caller is not the course owner or an admin. Audited. |
| `GET /admin/audit` | — | 200 `AuditEntryDto[]`: `{ id, actorEmail, action, target, detail, createdAt }`, newest first. In-memory ring; restarts with the process. |
| `GET /admin/demo-password` | — | 200 `DemoPasswordStatus`: `{ accounts, logins: [{ name, email, role }], source, rotatedAt, rotatedBy }`. `source` says whether the shared password is the startup value or was rotated here. |
| `POST /admin/demo-password/rotate` | — | 200 `DemoPasswordRotation`: `{ password, accounts }`. Rewrites every demo account to a new shared password and shows it once. 400 when no demo accounts exist. Audited. |
| `GET /admin/stats` | — | 200 `AdminStatsDto`: `{ totalUsers, students, instructors, admins, courses, publishedCourses }`. |
| `GET /admin/telemetry` | — | 200 `AdminTelemetryDto`: `{ uptimeSeconds, requests, serverErrors, p50Ms, p95Ms, p99Ms, recentErrors[] }`. Counted from process start, not over a rolling window. |

`ServerErrorDto` is `{ at, requestId, method, path, status, message, durationMs }`.
The request id matches the `X-Request-Id` header and the log line, so the admin card
and the server log describe the same incident.

### Operational endpoints outside `/api/v1`

| Endpoint | Access | Behaviour |
| --- | --- | --- |
| `GET /actuator/health` | public | `{ status: "UP" }`-style liveness. Used by the startup scripts and CI. |
| `GET /actuator/metrics`, other actuator paths | admin | Micrometer metrics; `TelemetryService` reads the same registry for the admin view. |
| `GET /swagger-ui.html`, `/v3/api-docs` | public in dev | Interactive schema. Disabled by the `prod` profile because production should not publish the whole surface. |

## 6.15 Client guidance

- **Never compute a grade, an unlock, a level or a deadline state locally.** Every
  one of them is returned by the API, and the browser is only a renderer.
- **Send answers, not scores.** The completion request carries the learner's
  choices; the server decides the result.
- **Treat 429 as "wait", not "retry now".** Login lockout, mail throttle, AI quota
  and viva permits all mean that an immediate retry will fail again.
- **A 401 is a session event, not a page error.** The shared axios interceptor
  clears the session and returns to sign-in; a page should not invent its own
  redirect.
- **A 403 on course content usually means visibility, not a bug.** Drafts,
  archived courses and members-only courses are hidden by design.
- **Use `fieldErrors` when present.** It carries one message per invalid field, so
  a form can point at the right input instead of showing a generic failure.
- **Do not cache a course tree as truth.** Another tab, a reset, or a teacher's edit
  can change it; refetch after any completion or reset.
