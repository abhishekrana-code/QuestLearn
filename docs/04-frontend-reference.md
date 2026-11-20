# 4. Frontend reference

Root: `questlearn-frontend/src`

The frontend is a React 18 single-page app built by Vite, styled with Tailwind and
a small design-token layer, and served as static files. It owns presentation and
client state only: scores, XP, unlocks, deadlines and permissions are decided by
the backend. This page walks the source in dependency order, then each route.

Every exported component, hook and service function is listed. Small presentational
helpers are grouped where they only arrange markup; anything that carries a rule,
talks to the API, or changes what the user can do is described on its own.

## 4.1 How the app is assembled

| Piece | File | What it does |
| --- | --- | --- |
| HTML shell | `index.html` | Mounts `#root`, sets the metadata, and runs a tiny inline script that applies the stored light/dark class before React loads so a light-theme user never sees a dark flash. |
| Entry | `main.jsx` | Creates the React root and wraps `<App />` in `BrowserRouter`, `ThemeProvider`, `AuthProvider` and `GamificationProvider`, in that order. |
| Routes and guards | `App.jsx` | Declares every URL, lazy-loads the heavy screens, renders the navbar for signed-in users, and holds the skip link and `<main>` landmark. |
| Global CSS | `index.css`, `styles/tokens.css` | Tailwind layers plus CSS variables for colour, radius, shadow and typography. Components use semantic classes (`panel`, `btn-primary`, `field`, `chip`) instead of repeating utility strings. |

### 4.1.1 `App.jsx`

| Function | Behaviour |
| --- | --- |
| `LoadingScreen({ label })` | Full-height spinner with a sentence. Used both for the initial auth boot and as the `Suspense` fallback while a lazy route chunk downloads. |
| `HomeRoute()` | Signed-out visitors get `Landing`; a signed-in student is sent to `/dashboard`, an instructor to `/studio`, an admin to `/admin`. It waits for `booting` first, so a refresh never flashes the public page at a signed-in user. |
| `App()` | Renders the navbar only when a user exists, then the route table inside one `<main id="main-content">`. `/login`, `/register` and `/forgot-password` redirect signed-in users home; `/reset-password` and `/verify-email` stay reachable while signed in because those links can be opened in any tab. |

Lazy chunks: `StudentDashboard`, `Announcements`, `SkillTreePage`, `Leaderboard`,
`InstructorStudio`, `InstructorCourses`, `AdminPanel` and the other studio screens. The landing page,
sign-in and registration stay in the initial chunk so a phone on a slow link reaches
the form quickly.

### 4.1.2 Route table

| URL | Page | Allowed roles | Why the guard is here |
| --- | --- | --- | --- |
| `/` | `HomeRoute` → `Landing` or a redirect | public | The marketing page doubles as the router's front door. |
| `/login`, `/register`, `/forgot-password` | auth screens | signed-out only | A signed-in user has no reason to see them. |
| `/reset-password` | `ResetPassword` | public | The emailed link may be opened in a fresh tab. |
| `/verify-email` | `VerifyEmail` | public | The confirmation link may be opened signed out. |
| `/accessibility` | `Accessibility` | public | The statement must be readable without an account. |
| `/dashboard` | `StudentDashboard` | `STUDENT` | Personal progress and the next node. |
| `/announcements` | `Announcements` | `STUDENT` | Every notice for the learner's courses and classes, newest first. |
| `/explore` | `ExploreCourses` | `STUDENT` | Joining and leaving courses is a learner action. |
| `/courses/:courseId` | `SkillTreePage` | all three roles | Learners play it; teachers and admins preview it. |
| `/courses/:courseId/materials` | `CourseMaterials` | all three roles | The course readings; the owning instructor uploads, everyone who may view the course can ask cited questions. |
| `/performance` | `StudentPerformance` | `STUDENT` | Cross-course grades and attempt history. |
| `/leaderboard` | `Leaderboard` | all three roles | Students see the board; staff can rank one course or class. |
| `/studio/courses` | `InstructorCourses` | `INSTRUCTOR`, `ADMIN` | The course library. |
| `/studio/courses/:courseId/roster` | `CourseRoster` | `INSTRUCTOR`, `ADMIN` | Who is enrolled and what they cleared. |
| `/studio/courses/:courseId/roster/:userId` | `LearnerDetail` | `INSTRUCTOR`, `ADMIN` | One learner's attempt trail. |
| `/studio/courses/:courseId/analytics` | `CourseAnalytics` | `INSTRUCTOR`, `ADMIN` | Where a course loses people. |
| `/studio/courses/:courseId/cohorts` | `InstructorCohorts` | `INSTRUCTOR`, `ADMIN` | Class codes, membership gating and class deadlines. |
| `/studio` | `InstructorStudio` | `INSTRUCTOR`, `ADMIN` | The five-step course builder. |
| `/admin` | `AdminPanel` | `ADMIN` | Accounts, moderation, demo logins and server health. |
| `*` | `NotFound` | public | Says the address does not exist instead of bouncing silently. |

`ProtectedRoute` adds the `NoAccess` screen rather than a redirect when a signed-in
account opens a page its role cannot use. `NoAccess` explains the audience and offers
the correct home for that role, while the address bar keeps the URL the person typed.

## 4.2 Cross-cutting services

### 4.2.1 `services/api.js`

The single axios instance. Every call is relative to `/api/v1`, so the same build
works behind the Vite proxy in development and the Tailscale/static host in
production.

| Export | Behaviour |
| --- | --- |
| `UNAUTHORIZED_EVENT` | String constant (`questlearn:unauthorized`) used to tell `AuthContext` that a 401 happened. |
| `tokenStore.get/set/clear` | Reads/writes/removes `questlearn.token` in `localStorage`. `get` swallows storage exceptions (private mode, disabled storage) and returns `null`. |
| `userCache.read/write` | Caches the last `AuthUser` under `questlearn.user` so a refresh can paint the navbar before `/auth/me` answers. `write(null)` removes it. |
| request interceptor | Adds `Authorization: Bearer <token>` when a token exists. |
| response interceptor | On any 401 it dispatches `UNAUTHORIZED_EVENT` and still rejects, so the caller's `catch` runs. This is what signs a user out when a token expires or a password rotation revokes their session. |
| `apiError(error, fallback)` | Turns an axios failure into one human sentence. No response → "Cannot reach the QuestLearn server…"; `fieldErrors` → the first field message; `message` → that message; a plain-text 5xx from a proxy → the offline sentence; anything else → the caller's fallback. `ERR_CANCELED` returns the fallback quietly. |

The distinction matters: a dead backend, an expired session and a validation failure
must not all read as "Something went wrong".

### 4.2.2 `services/deadlines.js`

Deadlines are advisory. The server computes the state (including the due-soon
window), and this module maps state to words, colours and input values. It never
decides lateness itself.

| Export | Behaviour |
| --- | --- |
| `DEADLINE_STATE` | Frozen map of `UPCOMING`, `DUE_SOON`, `OVERDUE`, `COMPLETED`, `COMPLETED_LATE` to `{ label, chip }`. |
| `deadlineStateMeta(state)` | Returns the entry or `null` for an unknown state, so a newer server state degrades to no chip instead of crashing. |
| `isOpenDeadline(deadline)` | False for both completed states; used to count "open" work and to keep finished nodes visible but quiet. |
| `sortForPanel(deadlines)` | Overdue first, then due soon, upcoming, completed, completed late; ties by due date, then node title. |
| `formatDeadline(iso, locale?)` | `16 Nov 2026, 11:00` in the browser's locale and time zone; empty string for an invalid date. |
| `toDateTimeInput(iso)` | Formats an instant for `<input type="datetime-local">` in *local* time. |
| `fromDateTimeInput(value)` | Parses that local input back into a UTC ISO instant, or `null` when empty/invalid. |
| `deadlineHint(state)` | One-line map badge: `Overdue` (danger), `Due soon` / `Done late` (warning), otherwise `null`. |

### 4.2.3 `services/lesson.js`

| Export | Behaviour |
| --- | --- |
| `EMPTY_LESSON` | `{ sections: [], keyTakeaways: [] }`, the starting draft for a new node. |
| `lessonPayload(draft)` | Trims every section heading/body and takeaway, drops blank rows, omits empty arrays, and returns `null` when nothing is left. That `null` means "this node has no lesson text yet" rather than an object full of empties. Any extra keys in the draft are preserved. |

### 4.2.4 `services/media.js`

Video handling for a node. The browser never proxies bytes through the application
server: it asks for a ticket, uploads straight to storage, then tells the API which
object arrived.

| Export / helper | Behaviour |
| --- | --- |
| `isPlayableVideo(url)` | True only for container formats a `<video>` element can play directly (`.mp4`, `.webm`, `.mov`, `.m4v`, `.ogv`). |
| `youTubeStartSeconds(url)` (private) | Reads `t=` or `start=` in `90`, `1m30s` or `1h2m3s` form; returns seconds. |
| `getYouTubeEmbedUrl(url)` | Extracts the 11-character id from the usual YouTube URL shapes and returns a `youtube-nocookie.com/embed/...` URL with the start offset. `null` for anything else. |
| `getVimeoEmbedUrl(url)` | Returns a `player.vimeo.com/video/<id>` URL for Vimeo links. |
| `uploadModuleVideo(moduleId, file, onProgress)` | POSTs for an upload ticket, PUTs the file, then POSTs the attachment record and returns the updated node fields. |
| `putFile(ticket, file, onProgress)` (private) | The raw PUT. Uses `XMLHttpRequest` because only it reports upload progress. Applies the ticket headers, sets a content type when the ticket does not, reports whole percentages, and turns 403 into "That upload link expired", other statuses into an HTTP message, network failure and timeout into their own sentences. |
| `attachModuleVideoUrl(moduleId, url, label)` | Points the node at externally hosted video; the label is optional. |
| `removeModuleVideo(moduleId)` | Deletes the node's video reference. |

### 4.2.5 `services/rosterCsv.js`

The roster export is a spreadsheet, so quoting is a correctness issue rather than
cosmetics.

| Export / helper | Behaviour |
| --- | --- |
| `cell(value)` (private) | RFC 4180 escaping: wraps a value in quotes only when it contains a comma, quote or newline, doubling internal quotes. `null`/`undefined` become an empty cell. |
| `toCsv(rows)` | Joins escaped cells with commas and rows with CRLF, which Excel and Sheets both accept. |
| `rosterFileName(roster)` | `course-title-roster-YYYY-MM-DD.csv`, slugged, capped at 40 characters, with `course` as the fallback. |
| `rosterToRows(roster)` | Header row plus one row per learner: name, email, XP, level, streak, cleared count, joined, last activity, then one column per node carrying the node title the teacher wrote and a status word (`Cleared`, `Open`, `Locked`). |

### 4.2.6 `services/ai.js`

| Export | Behaviour |
| --- | --- |
| `getAiStatus()` | `GET /ai/status`: whether a Groq key is configured and which models are in use. |
| `submitViva(moduleId, { audio, filename, durationMs })` | Multipart upload of a spoken answer. It clears the axios JSON content type so the browser supplies the multipart boundary, and allows two minutes. Nothing is stored by the backend. |
| `submitWrittenViva(moduleId, answer)` | Posts `{ answer }` to the same viva endpoint; grading, XP and unlocks are identical to the spoken path. |
| `generateCourse({ topic, audience, category, nodeCount })` | `POST /ai/courses` with a three-minute timeout; returns the draft course, its warnings and counts. |

### 4.2.7 `utils/dates.js`

`shortDate(value)` renders a compact local date (`16 Nov`) and returns an em dash
for missing or unparseable values. Used anywhere a full timestamp would crowd a row.

## 4.3 Global state

### 4.3.1 `context/AuthContext.jsx`

| Member | Behaviour |
| --- | --- |
| `AuthProvider` | Initialises `token` from `tokenStore` and `user` from `userCache`, so a refresh renders immediately. `booting` starts true only when a token exists. |
| boot effect | With a token, calls `/auth/me` to confirm the session and refresh the cached user; a 401 is handled by the interceptor. Cancels on unmount so a fast logout cannot write a stale user back. |
| `logout()` | Clears the token and cached user and resets both state values. |
| unauthorized listener | Calls `logout()` whenever `UNAUTHORIZED_EVENT` fires, which is how an expired token or a revoked session clears the UI. |
| `persistSession(data)` (private) | Stores the token and user, updates state, returns the user. Shared by login, registration and password change. |
| `login(email, password)` | `POST /auth/login`, then persists. Throws to the caller on failure. |
| `register(payload)` | `POST /auth/register`, then persists. |
| `updateUser(partial)` | Merges fields into the current user and rewrites the cache. Used by gamification awards, deadline preferences and profile refreshes. |
| `refreshProfile()` | `GET /auth/me` and replaces the cached user; returns it. |
| `changePassword(currentPassword, newPassword)` | `PATCH /auth/password`. The backend revokes every other session and returns a replacement token for this browser; persisting it keeps the current tab signed in. |
| `useAuth()` | Throws outside the provider, so a missing provider fails loudly during development instead of yielding `undefined` at runtime. |

### 4.3.2 `context/GamificationContext.jsx`

Holds the XP figure shown in the navbar and dashboard, plus the two celebrations.

| Member | Behaviour |
| --- | --- |
| initial stats | `EMPTY_STATS` (`0` XP, level 1, `0` streak, `100` next level) for signed-out users. |
| user sync effect | Copies `totalXp`, `currentLevel`, `streakDays`, `nextLevelXp` from the auth user whenever it changes, which is also how a page refresh restores the bar. |
| `award(result)` | Applies an `XpAwardResponse`: replaces the four stats, shows the floating `+XP` burst when `xpGained > 0`, opens `LevelUpModal` when `leveledUp`, and mirrors the numbers into the cached auth user. A retake with no XP therefore updates nothing visible. |
| `xpBurst` | Floating "+40 XP" chip, cleared after 2.2 seconds. |
| `dismissCelebration()` | Closes the level-up modal. |
| `useGamification()` | Throws outside the provider. |

### 4.3.3 `context/ThemeContext.jsx`

| Member | Behaviour |
| --- | --- |
| `systemTheme()` (private) | `light` when `prefers-color-scheme: light`, otherwise `dark`. |
| `readStored()` (private) | Reads `questlearn.theme`; accepts only `light`, `dark` or `system`, defaulting to `light`. |
| `ThemeProvider` | Resolves `system` against the live media query, applies `light`/`dark` to `<html>`, updates the `theme-color` meta tag and `color-scheme`, and persists an explicit choice. A storage failure (private mode) only means the choice will not persist. |
| `setTheme(next)` | Sets and stores the preference. |
| `toggle()` | Flips the *resolved* theme, so the first press from "system" does something visible. |
| `useTheme()` | Throws outside the provider. |

## 4.4 Hooks

### 4.4.1 `hooks/useAutoRetry.js`

`useAutoRetry({ active, retry, max = 5 })` retries a failed load on a widening gap
(3s, 4.2s, 5.9s, 8.2s, then 10s), then stops and leaves a manual button in charge.

| Return | Behaviour |
| --- | --- |
| `paused` | True once `max` automatic tries have been used, or after a manual retry is requested. The banner uses it to say "retries paused". |
| `retryNow()` | Resets the count and pauses, then calls `retry` immediately. |
| `reset()` | Resets count and pause without calling `retry`; pages call it when a load succeeds. |

The attempt counter lives here, not in the caller's error flag, because some pages
keep the error true during a retry and some clear it at the start; either pattern
would otherwise schedule a second timer for one try.

### 4.4.2 `hooks/useDialogFocus.js`

`useDialogFocus(containerRef, { onEscape })` gives every modal the keyboard behaviour
it owes the user:

- moves focus to the first focusable child unless something inside already has it
  (so an `autoFocus` field wins);
- cycles Tab and Shift+Tab inside the dialog, wrapping at both ends;
- calls `onEscape`;
- restores focus to the connected control that opened it on unmount.

The focusable selector excludes disabled controls and `tabindex="-1"`. A dialog with
no focusable content keeps focus on the container instead of letting Tab escape.

## 4.5 Shared components

### 4.5.1 Common

| Component | Behaviour |
| --- | --- |
| `Logo({ size, inverse, markOnly, className })` | Brand mark and wordmark. Sizes `sm`/`md`/`lg`, optional inverse colour for dark panels, and `markOnly` for tight headers. Decorative SVG is `aria-hidden`. |
| `Navbar()` | Role-aware top bar. `LINKS_BY_ROLE` decides the links; the mobile menu closes on outside pointer, Escape and route change. The outside handler ignores the toggle button (`mobileButtonRef`) so one tap on the hamburger does not both close and reopen the menu. Shows `XPBar`, `StreakCounter`, `ThemeToggle`, the account menu, change-password and sign-out. |
| `ProtectedRoute({ roles, children })` | Waits for auth boot, redirects signed-out users to `/login`, and returns `NoAccess` (URL preserved) when the role is wrong. |
| `NoAccess({ roles })` | Explains that the page belongs to `audienceFor(roles)` — learners, teachers, admins or teachers and admins — and offers the signed-in role's home. |
| `LoadErrorBanner({ message, paused, onRetry, className })` | Renders nothing without a message; otherwise the reason, whether automatic retries are still running, and a "Try again" button. `role="status"` so a retry result is announced without stealing focus. |
| `ConfirmDialog({ title, message, confirmLabel, cancelLabel, busy, error, onConfirm, onClose })` | Generic destructive-action dialog. Escape closes only when not busy; the backdrop is a labelled button; the confirm button disables while running; a server error stays in the dialog instead of closing it. Uses `useDialogFocus`. |
| `ChangePasswordDialog({ onClose })` | Current/new/confirm fields with show/hide toggles, at least 8 characters, match check, inline validation, and copy that says every other session will be signed out. On success it shows a confirmation and keeps the replacement token from `changePassword`. |
| `EmailVerificationBanner({ className })` | Renders only when `user.emailVerified === false` and not dismissed. "Resend" posts to `/auth/verify-email/resend`; it reports sent/failed and never blocks the rest of the page. |
| `FormattedText({ text, className })` | Renders a deliberately small inline format: `` `code` ``, HTML/XML tags shown as code (escaped, never injected), `**bold**`, `*italic*`, and newlines as `<br>`. Used for prompts, feedback and explainers, so teacher/AI text cannot inject markup. |
| `AnimatedButton({ variant, className, children, ...props })` | `motion.button` with the shared `btn-*` classes and a 1px hover lift / press scale. Variants: `primary`, `arcane`, `ghost`, `danger`. |
| `ThemeToggle({ compact })` | Segmented Light / Dark / System switch with `aria-pressed` on each option and a group label. |

### 4.5.2 Auth shell

`AuthShell({ aside, children })` is the shared frame for sign-in, registration and
the recovery screens: quiet header with logo and theme toggle, editorial left column,
one form card. Using one frame is what makes the auth flow feel like the product
rather than a bolt-on.

### 4.5.3 Gamification

| Component | Behaviour |
| --- | --- |
| `XPBar({ compact })` | Two presentations of the same numbers. Computes the level start as `100*(level-1)^2`, the end as the server's `nextLevelXp` (or the formula), and clamps the filled percentage to 0–100. Compact form for the navbar, raised panel for the dashboard. |
| `StreakCounter({ compact })` | Flame chip or panel showing `streakDays`; animates only when the streak is non-zero and the OS has not asked for reduced motion. |
| `LevelUpModal({ level, xpGained, unlocked, onClose })` | Fires confetti once (disabled under reduced motion), plays the bundled Lottie animation, states the new level, XP gained and how many nodes unlocked, and closes on Escape, backdrop or button. |

### 4.5.4 Deadlines

`DeadlinePanel({ overview, onChange, className })` shows the learner's dated work and
the digest opt-out.

- Sorts with `sortForPanel`, shows at most five, counts open (not completed) work,
  and says how many more exist.
- Each row links to its course and carries the state chip and local due date.
- The email switch writes `/auth/notification-preferences` and mirrors
  `notifyDeadlines` into the auth user, so the preference follows the learner
  between devices. The error is a `role="alert"` line inside the panel.
- Renders nothing when the overview is missing or has no deadlines.

## 4.6 Quiz components

### 4.6.1 `QuizPlayer({ quiz, onSubmit, disabled, retake })`

The shell around all three question types. The server owns the score.

| Function | Behaviour |
| --- | --- |
| `shuffle(values)` | Fisher–Yates copy, so the initial code order differs per attempt without mutating the source. |
| `buildAnswers()` | Shapes the payload per type: MCQ `[{ questionId, selectedIndex }]`, code order `[{ questionId: 'code-order', order: [lines] }]`, drag-drop `[{ questionId: 'drag-drop', matches }]`. |
| `submit()` | Calls the page-supplied `onSubmit` (which posts to `/modules/{id}/complete`), stores the graded response, and surfaces an axios error in place. |

Submit stays disabled until every MCQ question is answered, the code-order list is
non-empty, or every drag-drop item is matched. The result panel shows score, pass
state, the server message and explanations only after grading. The footer explains
that answers are server-scored, that a retake keeps the best score and pays no extra
XP, and that a completed node is retaken from the history panel.

### 4.6.2 Renderers

| Component | Behaviour |
| --- | --- |
| `MCQCard({ questions, answers, onSelect, disabled })` | One card per question, two-column options on wide screens, selected state announced visually and via `aria-pressed`, disabled after submission. |
| `CodeOrderQuiz({ prompt, lines, order, setOrder, disabled })` | `framer-motion` `Reorder` list. A dedicated grip starts the drag (`dragListener={false}`), so the text stays selectable and a keyboard/touch user is not forced to drag by the whole row. |
| `DragDropQuiz({ prompt, items, targets, matches, setMatches, disabled })` | Click-to-match rather than drag-only: select an item, then a target. Assigning a target clears any other item already there, so the mapping stays one-to-one. Items can be returned to the pool, and a reset clears all matches. |

## 4.7 Skill tree

| Component | Behaviour |
| --- | --- |
| `SkillTreeCanvas({ nodes, onSelect, onLockedClick, activeId })` | Lays the tree out on a grid: `230px` columns, `185px` rows, `32px`/`60px` padding. Computes the canvas size from the maximum node coordinates, draws one SVG edge per parent link (curved connectors, dashed while the child is locked), and positions `SkillNode`s by pixel centre. `activeId` highlights the open node. |
| `SkillNode({ node, x, y, active, onSelect, onLockedClick })` | An 84px node with status ring, quiz-type icon, XP and a deadline hint. Locked nodes shake and call `onLockedClick`; unlocked/completed nodes call `onSelect`. The positioned wrapper is a plain `div` because `framer-motion` owns `transform` on the inner element; mixing the two produced the earlier connector offsets. |
| `historySummary(history)` (page helper) | Compares the newest score with the oldest in a newest-first API list and returns "Up N points…", "Down N points…" or "Same score…". `null` for fewer than two tries. |

## 4.8 Studio components

| Component | Behaviour |
| --- | --- |
| `CourseDetailsDialog({ course, onClose, onSaved })` | Edits title, description, category and emoji only; nodes, quizzes and video have their own editors. Escape/backdrop close, body scroll is locked, Escape is a `window` listener, and save errors stay in the dialog. |
| `LessonEditor({ value, onChange, disabled })` | Visual editor for ordered sections (heading + body) and key takeaways: add, remove, move up/down. `asSections`/`asTakeaways` normalise whatever the API returned. An advanced JSON box is applied only when it parses, so a half-typed brace cannot reach Save. `write`, `updateSection` and `moveSection` keep the parent's draft immutable. |
| `NodeEditorDialog({ node, courseId, onClose, onSaved })` | Loads the full node on open (the tree only carries a summary), then edits title, summary, XP, lesson and due date. Saving the node and saving the deadline are separate calls; the deadline call happens only when the value actually changed, and clearing it sends DELETE. Video is deliberately untouched because the upload panel owns it. |
| `QuizEditor({ type, value, onChange, disabled })` | Visual builder for the three quiz types plus a raw JSON mode. `parsePayload` accepts an object, parses a string, and falls back to the template. `emit` preserves the parent's string/object convention. `applyJson` rejects non-objects and invalid JSON; `resetToTemplate` restores the `QUIZ_TEMPLATES` starter. `MultipleChoiceBuilder` (`updateQuestion`, `addQuestion`, `removeQuestion`, `setOption`, `addOption`, `removeOption`) keeps at least one question and two options; `CodeOrderBuilder` (`updateLine`, `addLine`, `removeLine`, `moveLine`) keeps a non-empty ordered list; `DragDropBuilder` (`updatePair`, `addPair`, `removePair`) keeps left/right pairs. |
| `VideoUploader({ node, onSaved })` | Per-node video: drop a file, choose one, or paste a URL; replace or remove. Files up to 100 MB upload immediately with a progress percentage; a link is attached with a button. `apply` updates the parent's node row, `uploadFile` runs the ticket → PUT → attach sequence, `handleDrop` enforces the size limit, `attachLink` validates a non-empty URL, `remove` clears it. |
| `CohortDeadlineEditor({ courseId, cohort, nodes, onNotice })` | One class's overrides of the course-wide dates, collapsed by default because most classes follow the course dates. `toLocalInput`/`formatDay` handle local display; `save` PUTs one node's override; `clear` DELETEs it. An override wins over the course-wide date, and the earliest of multiple overrides is the one shown. |

## 4.9 Viva dialog

`components/viva/VoiceVivaDialog.jsx` is the boss battle. Spoken answers go to Groq
Whisper and the reasoning model; nothing is stored. Typing is a first-class fallback
with the same grader, XP and unlocks.

| Function / block | Behaviour |
| --- | --- |
| `writtenHint(length)` | Live typing guidance: too short, on target, or too long, with the character range that usually reaches a pass. |
| `formatDuration(ms)` | `m:ss` timer for the recording. |
| `pickMimeType()` | Chooses the first supported recorder type (`audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`), or `''` so the browser default is used. |
| `Waveform({ levels })` | 24-bar level meter driven by the analyser; purely decorative. |
| `ScoreRing({ score, passed })` | Circular score in the verdict. |
| `BossHpBar({ viva, score })` | Boss health, full at 0 and empty at the pass threshold; shows the remaining HP and the pass mark. |
| `VerdictBody({ result, onRetry, onClose })` | Verdict, feedback, score, XP, follow-up question and the two exits (retry or close). Rendered as formatted text. |
| `VoiceVivaDialog({ module, viva, standing, onClose, onGraded })` | Phases: `idle` → `recording` → `grading` → `verdict`, plus `typing` and `error`. |
| `speak(text)` | Reads the examiner's line with the platform speech synthesiser, preferring an English male voice; silently does nothing when synthesis is unavailable or muted. |
| `startMeter(stream)` | Creates the analyser graph and paints the waveform at most every 55 ms. Failure is ignored: recording still works without the visual. |
| `startRecording()` | Checks `getUserMedia` and `MediaRecorder`, requests echo-cancelled/noise-suppressed audio, records in 250 ms chunks, starts the timer, auto-stops at 80 seconds, and turns permission/no-device errors into a typed-answer suggestion. |
| recorder `onstop` | Builds the blob, stops tracks/analyser, discards on unmount, rejects empty audio, then calls `submitViva` and moves to the verdict or an error. A 429 sets `busyExaminer` so the panel offers the routes that still work instead of an instant retry. |
| `submitTypedAnswer()` | Trims, enforces 15 characters, cancels speech, posts the typed answer and lands in the same verdict. |
| `stopRecording()` / `handleRetry()` | Manual stop; retry clears the result and returns to idle. |
| `onGraded` callback | The skill-tree page awards XP and refreshes the tree and briefing. The dialog itself never awards anything, so a failed grade cannot grant progress. |

The examiner's opening question is spoken once on open and can be replayed. The
phase panels are swapped without `AnimatePresence` on purpose: a modal waiting for an
exit animation can wedge itself shut when animations are throttled, leaving "Answer
again" looking dead.

## 4.10 Pages

Each entry states the route, who uses it, what it loads, and the functions that carry
behaviour. Presentation-only helpers are grouped.

### 4.10.1 `Landing.jsx` — `/`

Public marketing page and the only screen a signed-out visitor sees. It is composed
of `Header`, `HeroVisual`, `TreePanel`, `QuizPanel`, `VivaPanel`, `ProgressPanel`,
the feature/how/roles sections and `Footer`.

- The hero is a static course card (`HeroVisual`, `aria-hidden`) showing a finished,
  active and locked node, so the promise is visible before sign-up.
- The product section has a real tab list (`role="tablist"`/`tabpanel`): the tree,
  quiz, viva and progress panels are demo renderings, not screenshots, and they
  switch without navigation.
- `Header` closes its mobile menu on Escape and outside tap.
- Every call to action goes to `/register` or `/login`. Nothing on this page calls
  the API, so it works with the backend down.

### 4.10.2 `Login.jsx` — `/login`

`LoginAside` is the editorial column. `signIn(email, password)` calls
`useAuth().login`; `handleSubmit` validates non-empty fields, blocks a second submit,
and maps a failure to a message tied to the form. The error is announced and focus
returns to the first invalid field. A successful sign-in follows the role redirect
from `HomeRoute`.

### 4.10.3 `Register.jsx` — `/register`

`RegisterAside` lists the benefits. The form offers Student and Instructor roles
(admin is never self-service). `handleSubmit` checks name, email, password length,
confirmation and role before calling `register`; the server still validates
everything. A successful registration signs the user in immediately and lands on the
role's home.

### 4.10.4 `ForgotPassword.jsx` — `/forgot-password`

`ForgotAside` explains that the link expires after 30 minutes and works once.
`handleSubmit` posts `/auth/password-reset/request` and always shows the same "if that
address exists, a link is on its way" outcome, so the page cannot be used to enumerate
accounts.

### 4.10.5 `ResetPassword.jsx` — `/reset-password`

Reads `?token=`. The form enforces 8 characters and a match before posting
`/auth/password-reset/confirm`. Without a token it explains that the link is
incomplete rather than submitting an empty one. Success offers a link to sign in; the page stays usable
while signed in because the link can be opened in any tab.

### 4.10.6 `VerifyEmail.jsx` — `/verify-email`

`VerificationAside` explains what confirmation does and does not change. A
`useRef` guard makes the verification POST run once per mount even under React's
development double-effect. The result is one of: confirmed, link expired/invalid,
already confirmed, or no token. Confirmation refreshes the auth user so the dashboard
banner disappears immediately.

### 4.10.7 `NotFound.jsx` — `*`

Shows the attempted path and the role-specific home. It keeps the URL, so a mistyped
link is visibly a dead end rather than a silent redirect.

### 4.10.8 `Accessibility.jsx` — `/accessibility`

Static statement. It lists what is actually in place (keyboard reachability, skip
link, contrast, reduced motion, one main landmark, labelled fields, live regions) and
the known gaps (no generated captions, third-party embeds, etc.), plus how to report a
barrier. It deliberately does not claim blanket WCAG conformance.

### 4.10.9 `StudentDashboard.jsx` — `/dashboard`

The learner's home. Loads four things in parallel: `/courses`, `/leaderboard`,
`/me/deadlines` and `/me/next`. Deadlines and the next node are supplementary, so
their failure must not blank the page; the next-node endpoint may answer `204`.

| Behaviour | Detail |
| --- | --- |
| `load()` | One `Promise.all`; the two optional calls catch to `null`. Slices the leaderboard to five. |
| Auto-retry | `useAutoRetry` keyed on the main error; a successful reload resets it. |
| Course list | Enrolled courses first; a learner with no enrolments still sees the catalogue, so the first sign-in is never an empty page. |
| Next node | Renders the server's pick as "Pick up here" with course, XP and deadline chip, linking to `/courses/{id}?node={nodeId}`. |
| Cards | `XPBar`, `StreakCounter` and a cleared-node count. |
| Banners | `EmailVerificationBanner`, `LoadErrorBanner`, and `AnnouncementBanner` with the newest note across the learner's feed (one request, page size one). |
| Per-course row | Emoji, title, category, enrolled badge, description, progress bar and a Continue/Start link; the mobile footer repeats the action. |
| Details section | A collapsed block explaining how XP, levels and streaks work (the arithmetic matches the server). |

### 4.10.10 `Announcements.jsx` — `/announcements`

The learner's notice board. One call to `GET /announcements` returns the first page
already limited to live courses and to the learner's own classes, with each row's
course title and emoji attached, so the page does not fan out one request per course.
A separate `GET /courses/mine` fills the course filter. It renders the course chip,
audience (class name or "Everyone enrolled"), timestamp, full note text and author.

| Behaviour | Detail |
| --- | --- |
| `load()` | First page (20) from `fetchAnnouncementFeed`; the same response's `unreadCount` seeds the nav badge through `AnnouncementsContext`. A failed load shows an error with a **Try again** button. |
| Header and list | The server's total, the unread count and one panel per note, newest first, with the course and class it was addressed to. |
| Paging | **Load more** asks for the next page and appends it; the header keeps showing the total, not the rendered count. |
| Filters | **Unread only** and a course picker. Both go to `fetchAnnouncementFeed` as `unread` and `courseId`, so the server pages the narrowed list and its `total` follows the filter, while the unread pill and the nav badge keep the whole feed's number. A filtered empty list offers **Clear filters**. **Mark all read** is hidden while a course is selected because it clears the whole feed, not just the view. |
| Marking | Per note and **Mark all read**, both next to the count. Each updates the row, the header number and the shared badge locally, so the nav does not refetch. A failure is reported above the list and leaves the notes in place. |
| Empty state | "No notices yet", an explanation that notes appear here and in the dashboard banner, and a link to the catalogue. |
| Entry points | The dashboard banner and the student nav's **Notices** link, which also carries the unread badge (with a screen-reader count), both open this page. |

### 4.10.11 `ExploreCourses.jsx` — `/explore`

The catalogue, grouped by teacher. Search, teacher, subject and sort live in the URL
(`q`, `teacher`, `subject`, `sort`), so a filtered view can be shared or reloaded.

| Function | Behaviour |
| --- | --- |
| `progressOf` / `byNewest` / `byProgress` | Sort keys for course cards. |
| `catalogue` (memo) | Filters by teacher, subject and a case-insensitive needle over title, category, description and teacher; groups by instructor; adds node/cleared totals. |
| `setQuery` / `setFilter` / `setSort` / `clearFilters` | Rewrite only the relevant query parameters, using `replace` so typing does not fill the back stack. Invalid values fall back to "all". |
| `toggleTree(course)` | Opens an inline preview of a course's skill tree and caches the result per course. A failed preview shows its own error without breaking the card. |
| `joinClass(event)` | Posts the class code to `/cohorts/join`; the same call enrols the learner, so the catalogue reloads. Says when they were already a member. |
| `joinCourse(course)` | `POST /courses/{id}/enroll`, replaces that card with the returned course and confirms. |
| `leaveCourse()` | Confirms first, then `DELETE /courses/{id}/enroll`; the copy says progress is kept if they rejoin. |

The page also shows a filter summary with removable chips and a "no matches" state
that offers to clear the filters.

### 4.10.12 `SkillTreePage.jsx` — `/courses/:courseId`

The play screen, and the preview screen for staff (`user.role === 'INSTRUCTOR'`
hides learner-only progress and treats the page as a preview).

| Function | Behaviour |
| --- | --- |
| `loadTree()` | `GET /courses/{id}/skill-tree`; returns the tree so callers can chain. |
| `openNode(node)` | Highlights the node, clears the previous briefing, loads `GET /modules/{id}` and shows an error toast if the detail fails. |
| deep-link effect | Handles `?node=` once per course/node pair, removes the parameter, and explains a missing or still-locked node instead of opening an empty panel. |
| `handleVivaGraded(result)` | Awards XP only on a pass, then refreshes the tree and briefing (also on failure, so the attempt appears in history) and shows the server message. |
| `handleLockedClick()` | Toast explaining the prerequisite rule. |
| `startRetry()` | For a quiz node, remounts the quiz and scrolls it into view; for a viva-only node, opens the arena. |
| `completeModule(answers)` | `POST /modules/{id}/complete`. Awards only when `passed && xpGained > 0`, refreshes the tree and briefing even on failure, shows the message and returns the response to `QuizPlayer`. |
| `historySummary` / `timeAgo` | Attempt delta and relative time for the history panel. |

The briefing panel contains the lesson sections and takeaways, the optional video
(direct `<video>`, YouTube nocookie embed, or Vimeo embed), the deadline, XP, the quiz
and/or viva entry point, and the attempt history with a "Try again" action. The map
sits beside it from `xl` upward; below that, selecting a node scrolls the briefing
into view after it renders.

The header also links to `/courses/:courseId/materials`, so the readings are one tap
from the map.

### 4.10.13 `CourseMaterials.jsx` — `/courses/:courseId/materials`

The course readings and the questions asked about them. The PDF is processed by the
separate VerityAI service; this page only uploads, watches status and presents cited
answers.

| Function | Behaviour |
| --- | --- |
| `load(refresh)` | `GET /courses/{id}/materials?refresh=true`; returns the list. |
| polling effect | While any row is `UPLOADED` or `PROCESSING`, refreshes every 4 seconds. A settled course stops polling. |
| `upload(event)` | Sends the chosen file as `FormData` to `POST /courses/{id}/materials`; then reloads. |
| `remove(material)` | Confirms, then `DELETE /courses/{id}/materials/{id}`; clears any visible answer. |
| `ask(event)` | `POST /courses/{id}/materials/ask` with the trimmed question; renders the answer and its page citations. |
| course fetch | `GET /courses/{id}` once on mount; `instructorId` compared with the signed-in user decides whether the upload and delete controls render at all. |

Only an `ADMIN` or the `INSTRUCTOR` who owns the course sees the upload and delete
controls; the server enforces the same rule. An instructor teaching another
instructor's course can read the list and ask questions, but no upload or delete
action is rendered for them. The answer panel labels VerityAI's evidence status in plain language
("Grounded in the readings", "Answered without a citation", "No matching passage"),
and each source shows the document name, page number and excerpt.

### 4.10.14 `StudentPerformance.jsx` — `/performance`

Cross-course progress, folded up by subject.

| Function | Behaviour |
| --- | --- |
| `percentOf(cleared, total)` | Rounded percentage, `0` for an empty course. |
| `scoreChip(score)` | Colour band: success ≥80, gold ≥60, warning below, neutral for no score. |
| `topicRank(node)` / `attemptsLabel(node)` | Sort attempted quizzes by score (untried/locked last); humanise the try count. |
| `StatCard` / `ProgressBar` | Presentational; the bar has `role="progressbar"` with min/max/now and a label. |
| load effect | Loads `/courses`, then every `/courses/{id}/skill-tree` with `Promise.allSettled`, so one unreadable course does not erase the rest. |
| `overall` (memo) | Totals nodes and cleared nodes, counts started/finished courses, and averages only quizzes that were actually attempted. |
| `subjects` (memo) | Groups courses by category, computes completion and quiz average per subject, and sorts by completion then name. |
| `weakestTopics` (memo) | Attempted quizzes below 80%, worst first, capped at six. "Focus next" deliberately excludes 90% work. |
| `toggleHistory(node)` | Loads `GET /modules/{id}` on demand, reverses the newest-first history to oldest-first, and caches it; failures stay inside that topic. |
| `courseScore(course)` | Average of attempted quizzes in one course, or `null` when there are none. |

Topics expand per subject; a topic with history can expand again to show each try,
its source (quiz/spoken viva/typed viva) and the delta from the first try.

### 4.10.15 `Leaderboard.jsx` — `/leaderboard`

Three boards behind one control: `overall` (every course added up, each node counted
once), `all` (lifetime XP) and one course (XP earned inside it). Staff can narrow a
course board to one class.

| Function / effect | Behaviour |
| --- | --- |
| `initials(name)` | One or two uppercase letters for the avatar. |
| `load()` | Chooses `/leaderboard/overall`, `/leaderboard` or `/courses/{id}/leaderboard` (with `cohortId`) and maps each shape onto the same card fields (`combinedXp`→`totalXp`, `courseXp`→`totalXp`, node counts). |
| course effect | Loads published courses for the picker. A teacher's board opens on their first course because they have no building-wide board. |
| cohort effect | Only staff, only for a course board; loads that course's classes. |
| `podium` / `rest` | Reorders the top three for a 2–1–3 podium and leaves the rest in a ranked list. |
| Empty states | Distinguish "no course to rank", "no class members", "no nodes cleared" and "no students yet". |

The signed-in user's row is ringed. The podium uses rank labels as text, not colour
alone.

### 4.10.16 `InstructorCourses.jsx` — `/studio/courses`

The course library: active/archived tabs, search, and per-course actions.

| Function | Behaviour |
| --- | --- |
| `IconAction` | Labelled icon button. It uses `aria-disabled` rather than `disabled` so the control stays focusable and its title can explain why it is unavailable; the handler checks the flag. |
| `canManage(course)` | Admin, or the course's own instructor. Other teachers' published courses are visible but read-only. |
| `isArchived(course)` | `Boolean(course.archivedAt)`. |
| `visible` (memo) | Filters by tab and needle, then sorts manageable courses first and newest first. |
| `handleSaved(saved)` | Replaces the edited course in place and closes the dialog. |
| `duplicate(course)` | `POST /courses/{id}/duplicate`, adds the private draft and says how many nodes were copied. |
| `setArchived(course, archived)` | `PATCH /courses/{id}/archive`; archiving hides it from students without deleting work, restoring returns it as a draft. |
| `confirmDelete()` | Deletes only after the dialog confirms; the dialog shows the server's refusal in place. |

Each card links to the builder, roster, analytics and classes, and shows status
(draft/live/archived), node count, enrolment count and last update.

### 4.10.17 `InstructorStudio.jsx` — `/studio`

The five-step builder: Course → Nodes → Quiz → Videos → Publish. The step lives in
`?step=` and the course in `?course=`, so a shared link reopens the same screen.

| Function | Behaviour |
| --- | --- |
| `nextNodeSlot(nodes)` | Places the next node in a three-column grid (`x = 90 + (i % 3) * 220`, `y = 90 + floor(i / 3) * 170`). Teachers can still edit the two numbers for an unusual tree. |
| `StepFooter` | Back/next buttons with the neighbouring step's name. |
| `notify(type, text)` | Sets the shared success/error banner; the live region follows the type (assertive for errors, polite for confirmations). |
| `goTo(id)` | Validates the step id, updates the URL with `replace`, clears the "link copied" state and scrolls to top. |
| `copyStepLink()` | Builds `/studio?step=…&course=…` and copies it; a blocked clipboard gets an explanation. |
| `loadCourses(preferredId)` | `GET /courses`, selects the preferred/current/first course and returns the list. |
| `loadNodes(courseId)` | `GET /courses/{id}/skill-tree`; clears the table when no course is selected. |
| initial effect | Loads courses, honours a shared `?course=`, loads its nodes, and switches from the inline banner to the auto-retry state on failure. |
| AI status effect | `getAiStatus()`; an unreachable endpoint is shown as "is the API running?" rather than "not configured". |
| course-change effect | Reloads nodes, clears the selected quiz node and reports a load failure. |
| `createCourse(event)` | `POST /courses`, selects it, reloads, confirms that it is a private draft and jumps to Nodes. |
| `generateWithAi(event)` | Calls `generateCourse` with topic/audience/category/node count, selects the draft, reports the node count and the first warning, and jumps to Nodes. |
| `saveVideo(moduleId, data)` | Updates the node's video fields in place and confirms saved/removed. |
| `saveNodeEdits(saved)` | Closes the node dialog, reloads nodes and courses, and confirms. |
| `togglePublish(course)` | `PATCH /courses/{id}/publish?published=…`; replaces the course and says live/unpublished. |
| `addModule(event)` | Creates the node first, then sets the deadline through its own endpoint. A failed date is reported as "Node added, but …" rather than looking like a failed node. Resets the form to the next slot and reloads. |
| `attachQuiz(event)` | Parses the payload if the editor holds a string, posts `/modules/{id}/quiz`, reloads nodes, and translates a `SyntaxError` into "Quiz payload must be valid JSON." |

Step details:

- **Course** — create form (title, description, category, emoji) plus the AI builder
  with node counts 3–8 and a note that the result is an editable draft.
- **Nodes** — node title, summary, prerequisite, XP, coordinates, optional deadline
  and the lesson editor; below it a table of every node with prerequisite, due date
  (click to edit), position, XP, quiz type and an edit button.
- **Quiz** — node, type, pass mark and the visual/JSON builder; a coverage list shows
  which nodes still have no quiz.
- **Videos** — one `VideoUploader` per node; optional.
- **Publish** — a readiness checklist (nodes exist, how many have quizzes, whether any
  video is attached), a student preview link, publish/unpublish, and an explanation
  of what each state means.

### 4.10.18 `CourseRoster.jsx` — `/studio/courses/:courseId/roster`

Answers "who is enrolled, and who is stuck".

| Function | Behaviour |
| --- | --- |
| `initials(name)` | Avatar letters. |
| `downloadCsv(roster)` | Builds the sheet with `rosterToRows`/`toCsv`, creates a temporary object URL and clicks a hidden link with `rosterFileName`. |
| `emailsFromCsv(text)` | Extracts address-shaped tokens from pasted text or a file, so a whole spreadsheet column works. |
| `NodePill({ node })` | Compact node status with cleared score or locked state. |
| `LearnerRow({ learner, courseId })` | Avatar, name/email, XP/level/streak, progress bar, per-node pills, join date and last activity; the name links to the learner detail. |
| load effect | `GET /courses/{id}/roster` with optional `cohortId`, `nodeId` and `nodeCleared`; separate call for classes so the picker survives a filter that matches nobody. |
| `submitImport(event)` | Parses emails, refuses an empty list, posts `/courses/{id}/roster/import` with the selected class, shows added/already-enrolled counts, clears any node filter so the new rows are visible, and reloads. |
| `readFile(event)` | Reads a chosen CSV as text into the import box and clears the input. |

Filters: class, node, and cleared/not-cleared (default "not cleared"). The header
shows learner count, average cleared nodes and the active filters; export and print
buttons are print-hidden appropriately.

### 4.10.19 `LearnerDetail.jsx` — `/studio/courses/:courseId/roster/:userId`

One learner's attempt trail in one course.

| Function | Behaviour |
| --- | --- |
| `stamp(iso)` | Local `d MMM, HH:mm`, or "Not set". |
| `NodeCard` | Status chip, attempt count, best score and clear date, the full attempt list (score, source, time), and a Reset button only when there is something to reset (attempts > 0 or completed). |
| `resetNode(node)` | Confirms first, then `DELETE /admin/users/{userId}/modules/{moduleId}/progress`; reports success and reloads, or keeps the server's refusal inside the dialog. |

The header summarises cleared nodes, XP, level, streak, last activity and join date.
Reset is available to instructors and admins; the copy states that all attempts and
the XP for that node are lost and other work is untouched.

### 4.10.20 `CourseAnalytics.jsx` — `/studio/courses/:courseId/analytics`

The funnel per node, optionally limited to one class.

- `Bar({ value, total, tone })` draws a share of the learners who could reach the
  node. `hours(value)` renders minutes under an hour, hours under two days, then days.
- Loads classes and `/courses/{id}/analytics` (with `cohortId`); uses the same
  auto-retry pattern as the roster.
- Three counters: learners, started a node, cleared everything.
- `dropOff` names the node with the biggest reached-minus-cleared gap and explains it
  as a teaching target rather than a learner problem.
- The table shows reached, started, cleared, attempts and median hours to clear per
  node, with bar widths relative to the learner count.

### 4.10.21 `InstructorCohorts.jsx` — `/studio/courses/:courseId/cohorts`

Classes inside one course. A class code both adds a student to the class list and
enrols them in the course.

| Function | Behaviour |
| --- | --- |
| `create(event)` | `POST /courses/{id}/cohorts`, adds it alphabetically and shows the join code. |
| `toggleGating()` | `PATCH /courses/{id}/members-only`; turning it on removes the course from the catalogue so only a class code admits a student. |
| `copyCode(cohort)` | Copies the join code and shows a two-second confirmation; a blocked clipboard asks the teacher to select it manually. |
| `confirmDelete()` | `DELETE /cohorts/{id}` after confirmation; students stay enrolled and keep their progress. |

The page also renders `CohortDeadlineEditor` for each class, and links to the roster
and analytics.

### 4.10.22 `AdminPanel.jsx` — `/admin`

The operations screen. It loads stats, all courses, the audit feed, telemetry and the
demo-login status in parallel, then pages accounts from the server.

| Function | Behaviour |
| --- | --- |
| `actionLabel(action)` / `formatUptime` / `formatLatency` / `formatWhen` | Turn machine keys, seconds, milliseconds and instants into readable text. |
| `load()` | `Promise.all` of `/admin/stats`, `/courses`, `/admin/audit`, `/admin/telemetry`, `/admin/demo-password`. |
| accounts effect | 250 ms debounce, then `GET /admin/users?page&size&query`; one page at a time so a school-sized list is never shipped whole. |
| `searchQuery(value)` | Sets the needle and resets to page 0. |
| `ask(action)` / `runConfirm()` | Every privileged action goes through one confirm dialog. The dialog stays open with the server's message if the action fails. |
| `rotateDemoPassword()` | `POST /admin/demo-password/rotate`; shows the new shared password once, updates the status block and refreshes the audit feed. |
| `refreshAudit()` | Re-reads `/admin/audit`; a failure is ignored because the feed is supporting detail. |
| `changeRole(user, role)` | `PATCH /admin/users/{id}/role`, replaces the row and refreshes the audit feed. |
| `requestRoleChange` | Confirms promotions and demotions, so a stray arrow key in the select cannot change anyone's access. |
| `deleteAccount` / `requestDelete` | `DELETE /admin/users/{id}` after a confirmation that names the lost work; bumps the users version and reloads. |
| `resetPassword` / `requestReset` | `POST /admin/users/{id}/reset-password`, shows the one-time temporary password once, and says it is never stored in clear text. |
| `requestRotate` | Confirms the demo-password rotation, explaining that the old value stops working everywhere it was written down. |
| `togglePublish(course)` | `PATCH /courses/{id}/publish`; replaces the course and refreshes the audit feed. |

Sections, in order:

1. Four counters (accounts, students, instructors, live courses).
2. API health: request count, server errors, p50/p95/p99 latency, uptime and the
   recent-error list with request ids. The copy says counters restart with the
   process, so a fresh process is not "low traffic".
3. Demo logins: how many accounts share the password, the seeded logins by role, the
   rotate button and the one-time new value.
4. Accounts: search, mobile cards and a desktop table, role selects (self-change
   disabled), temporary-password reset and delete, with pagination.
5. Recent activity: the audit feed with human labels.
6. Course moderation: every course, its owner and status, with publish/unpublish.

The admin cannot change their own role or delete their own account; the controls say
why.

## 4.11 Styling and accessibility conventions

- **Tokens, not raw colour.** Components use semantic Tailwind names (`bg-card`,
  `text-fg-muted`, `border-line`, `gold-text`), so both themes and the contrast
  ratios move together. Hard-coded brand colours appear only in the landing hero and
  the print styles.
- **One main landmark.** `App` renders it; pages never add a second. Sections carry
  headings and, where useful, `aria-labelledby`.
- **Live regions.** Async results use `role="status"` (polite) or `role="alert"`
  (assertive) according to whether the message is a failure. This is why studio,
  library, roster, admin, auth and the skill-tree toast all name their role
  explicitly instead of relying on colour.
- **Dialogs.** Anything modal traps focus, closes on Escape when safe, locks body
  scroll and restores focus. `useDialogFocus` is the shared implementation; older
  dialogs that predate it still implement the same contract locally.
- **Motion.** `canvas-confetti` is disabled under reduced motion; Lottie and
  `framer-motion` decorations either respect the OS setting or are purely additive.
  No state change depends on an animation completing.
- **Errors are actionable.** A failed load says what failed, whether retries are
  running, and offers a manual retry. A failed action keeps the dialog open. A 401
  signs the user out through one event rather than a per-page redirect.

## 4.12 Frontend tests

Unit tests run in Vitest with Testing Library:

| Spec | Covers |
| --- | --- |
| `components/common/ChangePasswordDialog.test.jsx` | Length/match validation, submit, success copy, error handling. |
| `components/common/EmailVerificationBanner.test.jsx` | Visibility rules, resend, dismiss. |
| `components/common/FormattedText.test.jsx` | Code/bold/italic/tag rendering and escaping. |
| `components/deadlines/DeadlinePanel.test.jsx` | Ordering, the five-item cap, the digest toggle. |
| `components/quiz/MCQCard.test.jsx` | Selection and disabled state. |
| `components/studio/QuizEditor.test.jsx` | Visual/JSON round-trip and invalid JSON refusal. |
| `hooks/useDialogFocus.test.jsx` | Focus entry, Tab wrapping and restoration. |
| `services/deadlines.test.js` | State mapping, sorting, local/UTC conversion. |
| `services/media.test.js` | Direct-play detection and YouTube/Vimeo extraction. |
| `services/rosterCsv.test.js` | Quoting, filenames and row shape. |
| `pages/VerifyEmail.test.jsx` | Success, expired and missing-token states. |
| `pages/CourseMaterials.test.jsx` | Owner upload control, non-owner and learner views, cited answer, multipart body. |

End-to-end specs live in `e2e/` and run through Playwright against a real backend
(see [07-operations-testing.md](07-operations-testing.md)). Six specs (23 tests) cover
the public pages and the learner loop, studio authoring safeguards, the dashboard's
next-node deep link, mobile navigation, the admin health/accessibility claims and
class announcements.

## 4.13 Adding a screen safely

1. Put the route in `App.jsx` with the narrowest role list that works, and lazy-load
   it if it pulls in animation or chart code.
2. Load through `services/api.js`; never hard-code the host. Use `apiError` for every
   caught failure.
3. If the screen has a primary load, use `useAutoRetry` and `LoadErrorBanner` so a
   backend restart behaves the same everywhere.
4. Put server-owned numbers on screen, never in local arithmetic. XP, levels,
   unlocks, scores and deadline states all come from the API.
5. Announce async results with a live region, and keep destructive actions behind
   `ConfirmDialog`.
6. Test the narrow layout: the map and its briefing stack below `xl`, tables become
   cards or scroll, and the mobile menu must close on route change.
