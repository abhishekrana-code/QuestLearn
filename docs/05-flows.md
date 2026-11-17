# 5. End-to-end flows

This page follows the work, not the folders. Each flow names the screen that starts
it, the endpoints it crosses, and the service that owns the rule. When a flow can
fail, the failure branch is part of the description, because those branches are what
users actually experience.

## 5.1 First visit to first cleared node

The shortest path through the product, and the one every other flow supports.

1. **Landing.** A signed-out visitor opens `/`. `HomeRoute` renders `Landing` without
   calling the API, so the page works while the backend is starting. The product
   tabs are live demo panels, not screenshots.
2. **Registration.** `Register` posts `/auth/register`. `AuthService` validates the
   address and password, hashes the password, creates the account with the chosen
   role (student or instructor), and returns a token plus the `AuthUser` body.
   `AuthContext.persistSession` stores both, and `HomeRoute` sends a student to
   `/dashboard`.
3. **Dashboard.** `StudentDashboard` loads `/courses`, `/leaderboard`,
   `/me/deadlines` and `/me/next` in parallel. With no enrolments it still shows the
   catalogue rather than an empty page.
4. **Catalogue.** `ExploreCourses` loads `/courses`. The list is public courses the
   server considers visible to this learner; search, teacher and subject filters are
   URL parameters and are applied in the browser.
5. **Join.** Either the learner presses Join (`POST /courses/{id}/enroll`) or types a
   class code (`POST /cohorts/join`). The class-code route also adds them to the
   class list, which is why one code is enough to start a term.
6. **Skill tree.** `/courses/{id}` loads `GET /courses/{id}/skill-tree`. The server
   decides which nodes are `LOCKED`, `UNLOCKED` or `COMPLETED`; the frontend only
   draws them. A root node is open immediately; a child opens when its parent is
   cleared.
7. **Briefing.** Selecting a node loads `GET /modules/{id}`: lesson sections,
   takeaways, video reference, XP, deadline state, quiz summary, viva standing and
   attempt history. The quiz payload never includes correct answers or explanations
   before grading.
8. **Quiz.** `QuizPlayer` collects answers and calls `POST /modules/{id}/complete`.
   `QuizService` grades on the server, stores the attempt, updates the best score,
   returns score/pass/message and — only now — explanations.
9. **Award.** `ProgressService`/`GamificationService` marks the node complete on a
   pass, awards its XP once, may unlock children, and returns the new total, level,
   streak and `nextLevelXp`. `GamificationContext.award` updates the navbar, shows the
   XP burst and opens the level-up modal when the level changed.
10. **Refresh.** `SkillTreePage.completeModule` refreshes the tree and the briefing
    even when the attempt failed, so history and unlocked nodes match the server
    immediately.

**Failure branches.** A failed quiz still records the attempt and shows the score;
it just does not complete the node. A failed request leaves the quiz answers in
place and shows the server message. A locked node clicked on the map gets a toast,
not an empty panel. A missing node in a deep link is explained and the parameter is
removed.

## 5.2 Sign-in, session and sign-out

1. `Login` calls `AuthContext.login` → `POST /auth/login`.
2. `AuthService` checks the password hash and the login-lockout counter. A bad
   password increments the counter; too many failures lock that account for a while.
   Lockout state is in memory, so it is per running instance.
3. Success returns `{ token, user }`. The token is a signed JWT; the user body
   carries role, XP, level, streak, verification state and notification preference.
4. The token is stored under `questlearn.token`, the user under `questlearn.user`.
   The user cache is a paint aid only: every protected request still carries the
   token and is authorised on the server.
5. On a refresh, `AuthContext` calls `/auth/me` to confirm the token and refresh the
   cache. `booting` keeps guarded routes on a spinner until that answer arrives, so
   nobody sees the landing page flash.
6. Sign-out clears both storage entries and the React state. The same path runs when
   any response returns 401: the axios interceptor dispatches
   `UNAUTHORIZED_EVENT`, and `AuthContext` logs out. A token that expires or is
   revoked by a password rotation therefore clears the UI without a page reload.

`ProtectedRoute` separates "not signed in" (redirect to `/login`) from "signed in but
wrong role" (`NoAccess`, URL preserved). The backend repeats every role check; the
frontend guard is for clarity, not security.

## 5.3 Email verification and password recovery

### Verification

1. Registration sends a confirmation mail through `MailService` (SMTP when
   configured, otherwise a logged development adapter).
2. The dashboard shows `EmailVerificationBanner` only while
   `user.emailVerified === false`. It does not block any learning.
3. The emailed link opens `/verify-email?token=…`; `VerifyEmail` posts the token
   once (a ref guard prevents the development double-effect from consuming it twice).
4. `EmailVerificationService` checks expiry and single use, marks the address
   confirmed, and the page refreshes the auth user so the banner disappears.
5. Resend is `POST /auth/verify-email/resend`; it reports sent or failed without
   navigating away.

The link can be opened signed out; confirmation is about the address, not the
session.

### Password reset

1. `/forgot-password` posts `/auth/password-reset/request`.
2. `PasswordResetService` creates a single-use token that expires after 30 minutes
   and sends the link. The response is deliberately identical whether or not the
   address exists, so the form cannot enumerate accounts.
3. `/reset-password?token=…` checks length and confirmation in the browser, then
   posts the token and new password to `/auth/password-reset/confirm`.
4. The service consumes the token, stores the new hash and revokes existing
   sessions. The user signs in again with the new password.

**Changing a password while signed in** is different: `PATCH /auth/password`
verifies the current password, rotates the hash, revokes every *other* session, and
returns a replacement token for this browser. `ChangePasswordDialog` keeps the user
signed in by persisting that token.

## 5.4 An instructor builds and publishes a course

The studio is five screens because one long form buried the next action.

1. **Course.** `POST /courses` creates a private draft. A draft is invisible to
   students even though it appears in the teacher's library.
2. **Nodes.** `POST /courses/{id}/modules` adds a node with title, summary, XP,
   prerequisite, coordinates and an optional lesson. A root node has no prerequisite;
   every other node names one.
3. **Deadline.** If a due date was supplied, the studio makes a second call to
   `PUT /courses/{id}/modules/{moduleId}/deadline`. Creating the node and dating it
   are separate so a failed date cannot look like a failed node.
4. **Quiz.** `POST /modules/{id}/quiz` attaches one micro-quiz: multiple choice, code
   ordering or drag-and-drop matching, with a pass mark. Payload validation is
   server-side; the studio's visual builder and JSON box both produce the same shape.
5. **Video (optional).** A file goes ticket → storage PUT → attachment record; a
   hosted link goes `PUT /modules/{id}/video-url`. Video never passes through the
   application server.
6. **Publish.** `PATCH /courses/{id}/publish?published=true`. The readiness checklist
   is advisory; the server only requires a course that can be shown. Unpublishing
   hides it without deleting work.

**AI draft.** The AI builder posts `/ai/courses` with a topic, audience, category and
3–8 nodes. `AiAuthoringService` asks the model for a structured draft, validates and
truncates it, creates the course and nodes, and returns warnings. It is always a
draft: the teacher reviews every word and publishes explicitly. The quota is
in-memory, so a restart resets it; without a Groq key the panel explains what to
configure instead of offering a button that will fail.

**Why drafts exist.** A half-built tree should never be visible to a learner. The
`published` flag is the one switch that separates authoring from teaching.

## 5.5 Classes, class codes and members-only courses

1. **Create a class.** `POST /courses/{id}/cohorts` returns a name and a join code.
   A course can have several classes; each code belongs to exactly one.
2. **Share the code.** The teacher copies it from `/studio/courses/{id}/cohorts`.
3. **Student joins.** `POST /cohorts/join` with the code. `CohortService` adds the
   learner to the class *and* enrols them in the course in the same transaction. If
   they were already a member it says so instead of duplicating rows.
4. **Members only.** `PATCH /courses/{id}/members-only` removes the course from the
   public catalogue. From then on only a class code admits a student. Turning it off
   puts the course back in the catalogue.
5. **Per-class deadlines.** `CohortDeadlineEditor` writes overrides with
   `PUT /courses/{id}/modules/{moduleId}/deadline` scoped to a class, and removes
   them with DELETE. An override beats the course-wide date; if several apply, the
   earliest wins.

A class is an administrative grouping, not a separate copy of the course. Deleting a
class removes the grouping; its students stay enrolled and keep their progress.

## 5.6 Quiz grading, best score and retakes

1. The learner answers every question; `QuizPlayer` keeps Submit disabled until the
   answer set is complete.
2. `POST /modules/{id}/complete` carries the answer array. `QuizService` grades
   against the stored payload. Nothing in the browser knows the correct answers.
3. The attempt is recorded with source `QUIZ`, score and timestamp. A failing attempt
   is still an attempt: it appears in history and in analytics.
4. On a pass, the node is marked complete, its XP is awarded once, and children may
   unlock. The response includes score, pass state, XP gained, level, streak,
   unlocked node ids, message and explanations.
5. **Retakes** are allowed from the history panel. A retake keeps the best score and
   awards no additional XP, so grinding cannot inflate a profile. The frontend only
   celebrates when `xpGained > 0`.
6. **Reset by staff.** `DELETE /admin/users/{userId}/modules/{moduleId}/progress`
   removes every attempt on that node and the XP awarded for it, returning the node
   to its starting state. Other nodes are untouched. This is a support action, not a
   learner action.

Explanations are returned only after grading. That is what makes the quiz a check of
understanding rather than a source of answers.

## 5.7 Spoken and typed viva

A viva is a boss battle: one open question, a pass mark, and a score that damages the
boss.

1. **Open the arena.** The briefing shows the viva only when the server says it is
   available. `standing` carries previous attempts and best score.
2. **Spoken path.** `VoiceVivaDialog` asks for microphone permission, records up to
   80 seconds in 250 ms chunks, and shows a level meter. On stop it posts the blob to
   `POST /modules/{id}/viva`.
3. **Typed path.** If the microphone is missing, blocked or the browser cannot record,
   the same dialog offers typing. `POST /modules/{id}/viva` with `{ answer }` reaches
   the same grader. The page states that typed answers earn the same XP and unlocks.
4. **Grading.** `VivaService` checks the permit and quota, transcribes spoken audio
   through Groq Whisper (audio is not stored), and asks the reasoning model for a
   structured verdict: score, pass, feedback, follow-up question. `VivaGrader` applies
   the pass threshold (default 70) and maps the score onto boss HP (max 100).
5. **Result.** The dialog shows the score, verdict and feedback, speaks the verdict
   when voice is on, and calls `onGraded`. The skill-tree page awards XP on a pass,
   refreshes the tree and briefing on every outcome, and shows the server message.
6. **Failure.** A failed answer is stored as an attempt, with its feedback, so the
   learner can retry. A 429 means the examiner is busy or rate-limited; the panel
   says so and offers the routes that still work instead of an instant retry loop.
7. **Permits.** Viva permits and quotas are in memory: they limit concurrent grading
   on this instance, and a restart clears them. Like login lockout and AI quota,
   this is a single-instance control, not a distributed one.

The AI is allowed to grade and give feedback; it is not allowed to decide enrolment,
roles or deadlines. Those remain deterministic server rules.

## 5.8 Deadlines, reminders and late work

Deadlines are **advisory**. They change labels and reminders; they never block a
learner.

1. **Set.** A teacher supplies a local `datetime-local` value; the browser converts it
   to a UTC instant before sending. The API stores instants only.
2. **Resolve.** `DeadlineService`/`DeadlineStateResolver` computes `UPCOMING`,
   `DUE_SOON`, `OVERDUE`, `COMPLETED` or `COMPLETED_LATE` from the due instant, the
   completion instant and the due-soon window (7 days by default). The browser never
   computes lateness.
3. **Override.** A class date beats the course-wide date; the earliest applicable
   override wins. `EffectiveDeadlines` is the single place that resolves this.
4. **Show.** The dashboard panel sorts overdue first, then due soon, and keeps
   completed work at the bottom. The map adds a small hint only for overdue, due soon
   and done-late nodes. The briefing carries the full local date.
5. **Remind.** `DeadlineReminderService` runs on the scheduler and sends one daily
   digest for open due/overdue work to learners who have not opted out. The switch in
   the panel writes `notifyDeadlines`; the preference follows the account.
6. **Complete late.** A learner can still finish. The attempt is recorded and the
   node is completed; the state becomes `COMPLETED_LATE` and the roster shows it. Late
   work is information for the teacher, not a punishment from the system.

If the deadline endpoints fail, the dashboard still loads: the deadline call is
caught separately and the panel simply does not render.

## 5.9 Roster import, export and learner support

### Import

1. A teacher opens the roster and pastes addresses or chooses a CSV. The browser
   extracts address-shaped tokens, so a whole spreadsheet column works.
2. `POST /courses/{id}/roster/import` receives the list and an optional class id.
3. The server matches existing accounts, enrols them, adds them to the class when one
   was chosen, and reports counts for added and already-enrolled. It never creates
   accounts from an import: an address with no account is reported, not invented.
4. The page clears any node filter after a successful import, because a filter left
   over from before can hide every new row and make success look like a no-op.

### Export

`rosterToRows` builds one row per learner and one column per node, with the node
titles the teacher wrote and status words (`Cleared`, `Open`, `Locked`). `toCsv`
quotes anything that could break a row, so a comma in a course name cannot corrupt
the sheet.

### Support

- **Roster** answers "who is stuck": class filter, node filter, cleared/not-cleared,
  average cleared count, per-node pills and last activity.
- **Learner detail** answers "why": every attempt, its score, source and time. A
  teacher can reset one node after a confirmation that names the lost attempts and
  XP.
- **Analytics** answers "where": reached/started/cleared/attempts/median time per
  node, the biggest drop-off, and the same numbers limited to one class.

## 5.10 Admin moderation and operations

1. **Overview.** `/admin` loads counters, all courses, the audit feed, telemetry and
   demo-login status in parallel. Accounts are paged separately, 25 at a time, with
   a debounced server-side search.
2. **Role change.** The select asks for confirmation in both directions. Promoting
   grants admin powers; demoting removes them immediately but keeps the person's
   work. An admin cannot change their own role.
3. **Password reset.** The server issues a one-time temporary password. The panel
   shows it once and says it is never stored in clear text. Existing sessions are
   signed out.
4. **Delete account.** Confirmation names the progress, attempts and enrolments that
   go with the account. An admin cannot delete themselves.
5. **Course moderation.** Publish or unpublish any course. The action is audited.
6. **Demo password.** Rotating replaces the shared password for every demo account
   and shows the new value once. The current value stops working everywhere it was
   written down.
7. **Audit and telemetry.** Every privileged action writes an audit row with the
   actor and a stable action key. `TelemetryService` keeps request counts, error
   counts, latency percentiles and the recent-error ring with request ids. Both are
   in memory: they restart with the process, and the admin page says so.

## 5.11 Failure and degraded modes

The design assumes parts can be down.

| Failure | What the user sees | Why it is safe |
| --- | --- | --- |
| Backend unreachable | "Cannot reach the QuestLearn server…" in place, with retry | No data is invented; the request is rejected, not cached as success. |
| A load fails once | Banner with automatic retries (3s → 10s, five tries) | The page stays usable; a manual retry is always available. |
| Email is not configured | Mail is logged by the development adapter; verification is optional | Learning never depends on mail delivery. |
| AI key missing or Groq down | The studio says the AI builder is unavailable; the viva says the examiner could not grade | Manual authoring and the rest of the course keep working. |
| Quota/rate limit hit | An explicit 429 message, not a silent failure | The user knows retrying immediately will not help. |
| Session revoked | One 401 event clears the session and returns to sign-in | No page keeps acting on a dead token. |
| Deadline call fails | Dashboard still loads; the panel is omitted | Deadlines are supplementary by design. |
| Import partially matches | Added/already-enrolled/unknown are reported | No accounts are created from a spreadsheet. |

## 5.12 Who owns what

| Question | Owner |
| --- | --- |
| Can this account sign in? | `AuthService`, `LoginAttemptService` |
| What role is this user? | The JWT claims plus the user row; re-checked on every request |
| Is this node unlocked? | `ProgressService` / `CourseService` tree assembly |
| What is the score? | `QuizService` (server payload) |
| Did the viva pass? | `VivaGrader` / `VivaService` |
| How much XP and what level? | `GamificationService` |
| Is this overdue? | `DeadlineStateResolver` |
| Which date applies to this class? | `EffectiveDeadlines` |
| Can this teacher edit this course? | `CourseService` ownership check |
| Is the course visible? | `published`, `membersOnly`, `archivedAt` |
| Who did that privileged action? | `AuditService` |
| What is the request latency? | `TelemetryService` |

The frontend mirrors those answers so the interface is understandable. It never
becomes the authority for any of them.
