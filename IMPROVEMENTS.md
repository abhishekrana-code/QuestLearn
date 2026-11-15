# QuestLearn improvement list

Written after a full admin pass over the running app: sign in, admin overview,
accounts (search, pagination, role change, password reset), course moderation,
audit feed, server health, studio, roster, learner detail, analytics, learner
pages, 404, accessibility page, a 390px viewport, and the public tunnel.

Each item says what is wrong, why it matters, and how to check the fix. Status is
kept honest: **fixed** means it was changed and verified in this repository;
**next** and **later** are still open.

## Fixed in this pass

1. **Repeated row controls had no accessible names.** The accounts list shows one
   "Reset" button and one role select per row, so a screen reader heard "Reset"
   sixteen times with no way to tell whose row it was. Both controls now carry
   `aria-label` with the person's name, and the disabled own-row select says why.
   Check: focus the list with a screen reader or inspect the accessibility tree;
   every control names its own account.

2. **Admin password reset had no confirmation.** One click revoked that person's
   sessions and retired their password. It now asks first and spells out the
   consequence, matching the confirm already used when clearing a learner's node
   progress. Check: press Reset, cancel, and confirm nothing changes; confirm and
   see the temporary password banner and the audit row.

3. **Promotion to admin was one accidental select away.** Changing a role to
   ADMIN now asks for confirmation before the request is sent; cancelling snaps
   the select back. Check: change a test account to ADMIN, cancel, and see the
   role stay as it was.

4. **The activity feed leaked raw action keys.** Entries such as
   `module.deadline_cleared` and `course.roster_imported` sat next to humanised
   ones. The map now covers deadline and roster actions, and any future key is
   turned into words instead of printed raw. Check: the admin activity list reads
   as sentences only.

5. **The uptime badge was unreadable ("1M", uppercased).** It now reads
   "uptime 1m" with no case transform, so minutes and months cannot be confused.
   Check: the Server health header.

6. **The analytics class filter was silently empty.** With no classes it offered
   only "Every learner" and no explanation. It now shows a disabled "No classes
   yet" option. Check: open a course with no classes and look at the filter.

7. **Accounts can be deleted.** `DELETE /api/v1/admin/users/{id}` removes the
   account with its work, and each row has a Delete action that asks first. Two
   guards are enforced in the service, not just the UI: an admin cannot delete
   themselves, and the last admin cannot be deleted. An instructor who still owns
   a course is refused with that reason, because the schema holds the key. Progress
   and attempts are deleted first (they have no cascade), and the action is
   audited as "User deleted". Check: the admin list, the audit feed, and
   `AdminServiceTest` for the four guards and the delete order.

## Next, highest value first

8. **Silent role redirects.** A student who opens `/admin` or `/studio` is bounced
   to the dashboard with no message, and an admin opening `/performance` is
   bounced to `/admin` even though an admin can open a course tree. Decide the
   rule per route, then show a short "That page is for teachers" notice instead of
   a silent redirect.

9. **Server health counters reset on every restart.** After a restart the panel
   read "Requests served 1" while the app had handled many. Either label the
   numbers as "since restart" or move them to a counter that survives, so nobody
   reads a fresh process as low traffic.

10. **`POST /api/v1/auth/register` requires `role`.** The web form never asks for
    it, so any outside client gets 400 "Role is required". Make it optional and
    default to STUDENT, keeping the explicit value for tests.

11. **A fresh database still defaults to `password123`.** `DEMO_PASSWORD` fixes an
    existing install, but a new clone seeds the old default. Refuse to start the
    demo seeder outside localhost without `DEMO_PASSWORD`, or generate one and
    print it once.

## Later

12. **Cohorts have no empty state anywhere else.** The analytics picker was the
    first place this showed up; the classes page and the roster filter deserve the
    same look for "no classes yet".
13. **The browser suite cannot run on this machine.** Playwright fails with
    `browserType.launch: spawn UNKNOWN` while the JVM and browser processes are
    live, so end-to-end coverage is manual. Worth checking on a machine with more
    memory, or lowering Playwright's worker and viewport footprint.
14. **The public link is a temporary tunnel.** A quick tunnel expires, and today it
    did, which changes the URL and needs the backend CORS origin restarted. A
    named tunnel with a real domain, or an ngrok free dev domain, removes both
    problems.
15. **The demo login is one shared password.** Acceptable for an evaluation, but
    an admin should be able to see that it is shared and rotate it from the UI
    instead of editing `.env`.
