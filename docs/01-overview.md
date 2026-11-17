# 1. What QuestLearn is, and why

QuestLearn is a small, self-hostable learning management system built around one
idea: **a course should look like a path, not a folder.** A conventional LMS gives a
student a list of weeks and a stack of files. QuestLearn gives them a tree of nodes
whose edges are prerequisites, whose roots are open, and whose branches light up as
they prove understanding.

That single visual decision drives the rest of the product:

- Progress has a **shape** the learner can see, so "what next?" is answered by the
  screen instead of by a calendar.
- Every node ends in an **assessment** — a quiz or a spoken viva — so the tree records
  evidence, not just clicks.
- XP, levels and streaks turn the next node into a **short, finishable goal** without
  turning the course into a slot machine: XP is awarded once, by the server, for
  cleared work only.
- Instructors get the same tree as an **authoring surface**, plus the classroom
  plumbing that a real class needs: join codes, rosters, class deadlines, and a
  per-node funnel.

## 1.1 Who it is for

| Persona | What they need | What QuestLearn gives them |
| --- | --- | --- |
| **Learner** (student) | To know what to do next, to see progress, to recover from a bad attempt | Dashboard with one "continue" node, a skill tree with status and deadlines, replayable assessments that keep the best score, XP/level/streak feedback, a leaderboard scoped to their courses. |
| **Instructor** | To build a course quickly, run a class, and see who is stuck | A four-step studio (details → nodes → lessons/quizzes → publish), AI draft generation, video attach/upload, classes with join codes and class-specific deadlines, roster with CSV import/export, learner drill-down, per-node analytics. |
| **Administrator** | To keep accounts and the deployment healthy | User search, role changes, password resets, account deletion, progress resets, course publishing/archiving, audit trail, demo-credential rotation, usage stats, latency/error telemetry. |
| **Operator** | To run it on modest hardware and know when it is unwell | One Spring Boot jar, one static frontend, PostgreSQL, disk or S3 media, optional SMTP/Resend email, optional Groq key, health endpoint and an admin telemetry view. |

## 1.2 The learner's loop

```
Open dashboard
  └─ "Continue" card picks one unlocked node (overdue first, then due soon)
       └─ Open node: lesson sections, key takeaways, optional video
            └─ Choose a route:
                 ├─ Quiz: multiple choice / code ordering / drag-and-drop
                 └─ Viva: speak or type an answer to the examiner
                      ├─ fail → attempt recorded, best score kept, explanation shown
                      └─ pass → node COMPLETED, XP awarded once, level recomputed,
                                streak advanced, child nodes unlocked
```

A cleared node can be replayed. A replay never pays XP twice and never lowers the
best score; it only improves it. This removes the most common classroom support
request ("I want to try again") without creating an XP farm.

## 1.3 The instructor's loop

```
Studio → course details → add nodes (auto-placed, editable) → write lesson + quiz
       → attach a video (link or upload) → attach a viva (optional overrides)
       → publish → create a class (join code) → set class deadlines
       → import the roster → watch the funnel → open a learner who is stuck
```

Publishing is a switch, not a one-way door: a published course can be unpublished or
archived. Archiving hides a course from the catalogue without deleting anyone's work.
Deleting a course is admin-only and cascades deliberately.

## 1.4 The rules of the game

These rules are implemented in the backend; the browser only renders their results.

### XP and levels

- Each node has an `xpReward` (0–5000, set by the author).
- XP is awarded **once**, when a node first becomes `COMPLETED`.
- Retakes and viva attempts on an already-cleared node award **0 XP**.
- Total XP determines the level:

```
level = floor(0.1 × sqrt(totalXp)) + 1
XP needed to reach level L = 100 × (L − 1)²
```

| Level | Total XP required | XP needed for the next level |
| --- | --- | --- |
| 1 | 0 | 100 |
| 2 | 100 | 300 |
| 3 | 400 | 500 |
| 4 | 900 | 700 |
| 5 | 1,600 | 900 |
| 6 | 2,500 | 1,100 |
| 10 | 8,100 | 1,900 |

The curve is intentionally gentle at the start: a learner sees a level-up after one
or two nodes, which is what makes the first session feel worth finishing.

### Streaks

`GamificationService.registerActivity` runs on every first clear of a node:

| Last activity | Result |
| --- | --- |
| Never | streak = 1, today recorded, **advanced** |
| Today | unchanged, not advanced |
| Yesterday | streak + 1, advanced |
| Older than yesterday | reset to 1, advanced |

A streak is a **daily** signal, not a per-node signal: clearing three nodes in one
afternoon advances it once.

### Quiz scoring

Quizzes are stored as `JSONB` and graded on the server (`QuizService`). The score is a
percentage; the node's `passingScore` decides pass/fail.

| Type | Payload contract | How it is graded |
| --- | --- | --- |
| `MULTIPLE_CHOICE` | `{"questions":[{"id","prompt","options":[…],"correctIndex","explanation"}]}` | One point per question whose selected index equals `correctIndex`; unanswered or out-of-range counts as wrong. |
| `CODE_ORDER` | `{"prompt","lines":[…],"explanation"}` | One point per position where the submitted line equals the canonical line. The browser receives a shuffled copy. |
| `DRAG_DROP` | `{"prompt","pairs":[{"left","right"}]}` | One point per `left` whose matched `right` equals the canonical right. The browser receives separate `items` and `targets` arrays. |

An empty quiz payload scores 100, which is how a "reading only" node passes without a
fake test. A failed attempt is still written to `module_attempts` so the learner can
see the trail. The best score is retained on the progress row.

Explanations are stripped from the payload sent to the browser and returned **after**
grading, so the answer key never leaks ahead of the attempt.

### The viva (boss battle)

Every node can be cleared by answering an examiner instead of a quiz. The examiner's
configuration lives in the node's `content.viva` object and is entirely optional:

```json
{
  "viva": {
    "bossName": "The Complexity Warden",
    "openingQuestion": "Defend why a hash map beats a sorted array here.",
    "topics": ["hash maps", "amortised cost"],
    "passThreshold": 70,
    "maxHp": 100
  }
}
```

When absent, the examiner derives a boss name ("The Warden"), a question from the
node summary, and up to six topics from the lesson headings and takeaways. Default
pass threshold is **70**; default boss HP is **100**.

A spoken answer is recorded in the browser, streamed to Groq Whisper for
transcription, then graded by the configured reasoning model. Audio is **never
stored**. A typed answer follows the same grading path. Both write a `ModuleAttempt`
with the source `VIVA_SPOKEN` or `VIVA_WRITTEN`. A passing viva uses exactly the same
completion, XP and unlock logic as a passing quiz (`ProgressService.completeModule`
is not bypassed; `VivaService` shares the unlock helper).

### Deadlines

Deadlines are **advisory**. They never block a node, never lock a branch, and never
change a score. They exist so a class can see what is late and so a digest email can
go out.

- A node can have a course-wide `dueAt`.
- A cohort (class) can override that date for its members.
- If a learner is in two classes of the same course and both override the same node,
  the **earlier** date wins. No class can quietly extend a deadline another class
  already set.
- The server computes the state, using one configurable window (default 7 days):

| State | Meaning |
| --- | --- |
| `UPCOMING` | Due, but further away than the window. |
| `DUE_SOON` | Inside the window and not cleared. |
| `OVERDUE` | Past due and not cleared. |
| `COMPLETED` | Cleared on or before the due date. |
| `COMPLETED_LATE` | Cleared after the due date. |

The dashboard, skill tree, node briefing and reminder digest all call the same
`DeadlineStateResolver`, so "due soon" means the same thing everywhere.

### Leaderboards

Three scopes exist, all computed from persisted progress, never from client claims:

- **Overall** (`/leaderboard/overall`): combined XP across enrolled courses, with each
  learner's top courses shown.
- **Per course** (`/courses/{id}/leaderboard`): course XP, level, streak, nodes
  cleared.
- **Course, narrowed to a class**: the same query with a cohort id.

Test/demo accounts are excluded from ranking (the seed data marks them so the public
demo does not put fictional characters above real learners).

## 1.5 What QuestLearn deliberately does not do

These are product boundaries, not missing code:

- **No payment, tenancy or SCORM.** One deployment serves one institution or demo.
- **No proctoring.** A viva is a learning conversation, not an exam identity check.
- **No AI dependency for core learning.** Without a Groq key, quizzes, trees,
  rosters and deadlines all work; the viva and AI authoring explain that they are
  unavailable (`/ai/status` reports the truth).
- **No email dependency for accounts.** Verification is soft; an unverified account
  keeps every permission and only sees a reminder. Without a mail provider, reset
  links are written to the server log for an operator to deliver.
- **No server-side video transcoding.** A lesson video is either a URL (YouTube,
  Vimeo, an MP4) or an uploaded file stored as-is in disk/S3.
- **No hard real-time collaboration.** Studio edits are last-write-wins with
  optimistic UI feedback.

## 1.6 Honest degradation matrix

| Missing configuration | What still works | What changes |
| --- | --- | --- |
| `GROQ_API_KEY` | Everything except AI | `/ai/status` says unavailable; the studio hides generation; the viva panel explains and offers the quiz. |
| Email provider | Everything | Password-reset and verification tokens are logged instead of mailed; the UI still says "check your email" to avoid account enumeration. |
| S3 credentials | Everything | Media uses the local disk directory (`questlearn.media.video-dir`). |
| Instructor invite code | Student sign-up and all learning | Instructor self-registration is refused; an admin must create the account. |
| Demo password | Everything | A fresh database generates one and prints it once in the startup log; it can be rotated from the admin panel. |

## 1.7 Vocabulary

| Term | Meaning in this repository |
| --- | --- |
| **Node / module** | One unit of the skill tree. `modules` table, `Module` entity. |
| **Tree** | All nodes of a course plus the viewer's progress, returned as `SkillTreeDto`. |
| **Clear / conquer** | Move a node to `COMPLETED`. |
| **Attempt** | One graded quiz or viva submission, stored in `module_attempts`. |
| **Cohort / class** | A named group inside one course with a join code and optional deadline overrides. |
| **Roster** | The enrolled learners of a course, with per-node state. |
| **Viva** | The spoken or typed oral assessment attached to every node. |
| **Demo credential** | The single shared password for the seeded demo accounts, stored hashed and rotatable. |
| **Effective deadline** | The date that actually applies to one learner after class overrides are resolved. |

## 1.8 Where to go next

- For the machinery, read [02-architecture.md](02-architecture.md).
- For the code, jump to [03-backend-reference.md](03-backend-reference.md) or
  [04-frontend-reference.md](04-frontend-reference.md).
- For a worked story, read [05-flows.md](05-flows.md).
- For an endpoint, use [06-api.md](06-api.md).
- To run or test it, use [07-operations-testing.md](07-operations-testing.md).
