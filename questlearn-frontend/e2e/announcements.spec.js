import { expect, test } from '@playwright/test';
import {
  ADMIN,
  INSTRUCTOR,
  apiSignIn,
  authHeaders,
  createCourse,
  deleteUserByEmail,
  demoPassword,
  enroll,
  instructorToken,
  registerLearner,
  removeCourse,
  uniqueName,
} from './fixtures.js';

/**
 * The announcement channel: writing a note, reading it as a learner, and the
 * class-only case.
 *
 * <p>Each test builds its own course and learners and removes them again, so the
 * suite never borrows the demo's announcements or its roster. Notes are posted
 * through the studio form where the test is about composing, and through the API
 * where the test is about who can see what.</p>
 */

const run = Date.now();
const courseWideBody = `E2E note ${run}: the lab moved to Thursday.`;
const classBody = `E2E class note ${run}: bring the printed worksheet.`;
const cohortName = `E2E Class ${run}`;

/** Filled in by beforeAll; every learner this suite makes is deleted in afterAll. */
let fixture = null;
const createdEmails = [];
// Courses a single test creates for itself, so the shared fixture course keeps the
// notes the earlier tests posted.
const createdCourses = [];
const createdCohorts = [];
// The receipts tests need more learners than a per-email sign-out would make
// pleasant, so their accounts share a prefix and are deleted with one admin session.
const receiptsPrefix = `e2e.receipts.${run}.`;
const receiptsEmails = [];

test.beforeAll(async ({ request }) => {
  const health = await request.get('http://localhost:8091/actuator/health');
  expect(
    health.ok(),
    'The API is not answering on :8091. Start the backend jar before running this suite.',
  ).toBeTruthy();

  const token = await instructorToken(request);
  const courseTitle = uniqueName('Notices Course');
  const courseId = await createCourse(request, token, courseTitle);

  const cohortResponse = await request.post(`/api/v1/courses/${courseId}/cohorts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: cohortName },
  });
  expect(cohortResponse.ok(), 'Creating the fixture class').toBeTruthy();
  const cohort = await cohortResponse.json();

  fixture = { token, courseId, courseTitle, cohortId: cohort.id, joinCode: cohort.joinCode };
});

test.afterAll(async ({ request }) => {
  if (!fixture) return;

  await deleteReceiptsLearners(request);
  for (const email of createdEmails) {
    await deleteUserByEmail(request, email);
  }

  const headers = { Authorization: `Bearer ${fixture.token}` };
  for (const cohortId of createdCohorts) {
    await request.delete(`/api/v1/cohorts/${cohortId}`, { headers });
  }
  for (const courseId of createdCourses) {
    await removeCourse(request, fixture.token, courseId);
  }
  // The class goes before the course it belongs to; deleting a class keeps its
  // members' enrolment, so this only removes the grouping.
  await request.delete(`/api/v1/cohorts/${fixture.cohortId}`, { headers });
  await removeCourse(request, fixture.token, fixture.courseId);
});

async function signIn(page, email, password = demoPassword()) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page) {
  await page.goto('/');
  const account = page.getByRole('button', { name: /^[A-Z]{2} \S+$/ }).first();
  const signOutItem = page.getByRole('menuitem', { name: 'Sign out' });
  // A fetch that lands while the menu is open re-renders the header and detaches
  // the item, so reopen the menu only while it is closed and retry the click.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await signOutItem.isVisible())) {
      await account.click();
    }
    try {
      await signOutItem.click({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await expect(page).toHaveURL(/\/login/);
}

async function newLearner(request, label) {
  const email = `e2e.notices.${label}.${run}@questlearn.dev`;
  const token = await registerLearner(request, { name: uniqueName(`Notices ${label}`), email });
  createdEmails.push(email);
  return { email, token };
}

async function postNote(request, body, cohortId = null) {
  const response = await request.post(`/api/v1/courses/${fixture.courseId}/announcements`, {
    headers: { Authorization: `Bearer ${fixture.token}` },
    data: { body, cohortId },
  });
  expect(response.ok(), `Posting "${body}"`).toBeTruthy();
}

/** Posts anywhere, unlike `postNote`, which is tied to the shared fixture course. */
async function postAnnouncement(request, courseId, body, cohortId = null) {
  const response = await request.post(`/api/v1/courses/${courseId}/announcements`, {
    headers: { Authorization: `Bearer ${fixture.token}` },
    data: { body, cohortId },
  });
  expect(response.ok(), `Posting "${body}"`).toBeTruthy();
  return response.json();
}

/**
 * Registers and enrols a roster in small parallel batches. Fifty-one is enough for
 * the receipts panel to need its second page (the server caps a page at 50), and the
 * batch stays under the API's five-connection pool so no request waits for one.
 */
async function addReceiptLearners(request, courseId, count) {
  const learners = [];
  for (let start = 0; start < count; start += 4) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, count - start) }, async (_, offset) => {
        const number = String(start + offset + 1).padStart(2, '0');
        const email = `${receiptsPrefix}${number}@questlearn.dev`;
        const token = await registerLearner(request, {
          name: `Receipt Learner ${number}`,
          email,
        });
        receiptsEmails.push(email);
        await enroll(request, token, courseId);
        return { email, token };
      }),
    );
    learners.push(...batch);
  }
  return learners;
}

/**
 * Records reads through the learner endpoint one at a time. Each mark opens its own
 * short transaction (plus the recorder's), so a burst would compete for the pool.
 */
async function markLearnersRead(request, learners, announcementId) {
  for (const { token } of learners) {
    const response = await request.post(`/api/v1/announcements/${announcementId}/read`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) {
      throw new Error(
        `Marking announcement ${announcementId} read failed: ${response.status()} ${await response.text()}`,
      );
    }
  }
}

/** One admin session removes the shared-prefix roster without signing in per email. */
async function deleteReceiptsLearners(request) {
  if (receiptsEmails.length === 0) return;
  const admin = await apiSignIn(request, ADMIN.email);
  const headers = authHeaders(admin);
  for (const email of receiptsEmails) {
    const found = await (
      await request.get(`/api/v1/admin/users?query=${encodeURIComponent(email)}`, { headers })
    ).json();
    const match = (found.users ?? []).find((user) => user.email === email);
    if (match) await request.delete(`/api/v1/admin/users/${match.id}`, { headers });
  }
}

test('a learner who was sent nothing sees the empty state and no banner', async ({ page, request }) => {
  // Runs before anything is posted to the fixture course, so the course is quiet
  // for a reason rather than because a previous test cleaned up.
  const learner = await newLearner(request, 'quiet');
  await enroll(request, learner.token, fixture.courseId);

  await signIn(page, learner.email, 'password123');
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Latest notice/ })).toHaveCount(0);

  await page.goto('/announcements');
  await expect(page.getByText('No notices yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse courses' })).toBeVisible();
});

test('a posted note reaches the learner’s banner and page, and deleting it clears the banner', async ({
  page,
  request,
}) => {
  // 1. Compose it in the panel the publish step shows.
  await signIn(page, INSTRUCTOR.email);
  await page.goto(`/studio?course=${fixture.courseId}&step=publish`);
  await page.locator('#announcement-body').fill(courseWideBody);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('Posted to everyone enrolled in this course.')).toBeVisible();
  await expect(page.getByText(courseWideBody)).toBeVisible();
  // The draft is cleared, so the same note cannot be posted twice by accident.
  await expect(page.locator('#announcement-body')).toHaveValue('');

  // 2. A learner on the course sees it as the dashboard banner, which is also the
  // way into the notices page holding the same note.
  const learner = await newLearner(request, 'banner');
  await enroll(request, learner.token, fixture.courseId);
  await signOut(page);
  await signIn(page, learner.email, 'password123');
  await page.goto('/dashboard');

  const banner = page.getByRole('link', { name: /Latest notice/ });
  await expect(banner).toContainText(courseWideBody);
  await expect(banner).toContainText(fixture.courseTitle);

  await banner.click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByRole('heading', { name: 'Notices and announcements' })).toBeVisible();
  await expect(page.getByText('1 notice')).toBeVisible();
  await expect(page.getByText(courseWideBody)).toBeVisible();
  await expect(page.getByText('Everyone enrolled')).toBeVisible();

  // 3. Deleting it in the studio takes it off the learner's dashboard.
  await signOut(page);
  await signIn(page, INSTRUCTOR.email);
  await page.goto(`/studio?course=${fixture.courseId}&step=publish`);
  const row = page.getByRole('listitem').filter({ hasText: courseWideBody });
  await row.getByRole('button', { name: /^Delete/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this announcement?');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Announcement removed.')).toBeVisible();

  await signOut(page);
  await signIn(page, learner.email, 'password123');
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Latest notice/ })).toHaveCount(0);
});

test('a class note reaches its class and stays out of the other learner’s list', async ({
  page,
  request,
}) => {
  // Course-wide first, so the class note is the newer of the two and the banner
  // has something to choose between.
  await postNote(request, courseWideBody);
  await postNote(request, classBody, fixture.cohortId);

  // One learner joins the class by its code, which also enrols them in the course.
  const classLearner = await newLearner(request, 'class');
  const join = await request.post('/api/v1/cohorts/join', {
    headers: { Authorization: `Bearer ${classLearner.token}` },
    data: { code: fixture.joinCode },
  });
  expect(join.ok(), 'Joining the fixture class').toBeTruthy();

  // The other is on the course only, which is the case the class filter has to keep out.
  const courseLearner = await newLearner(request, 'course');
  await enroll(request, courseLearner.token, fixture.courseId);

  await signIn(page, classLearner.email, 'password123');
  await page.goto('/announcements');
  await expect(page.getByText('2 notices')).toBeVisible();
  await expect(page.getByText(courseWideBody)).toBeVisible();
  await expect(page.getByText(classBody)).toBeVisible();
  await expect(page.getByText(cohortName)).toBeVisible();

  // The newest note the class was sent is the one the banner leads with.
  await page.goto('/dashboard');
  const classBanner = page.getByRole('link', { name: /Latest notice/ });
  await expect(classBanner).toContainText(classBody);
  await expect(classBanner).toContainText('All 2 notices');

  await signOut(page);
  await signIn(page, courseLearner.email, 'password123');
  await page.goto('/announcements');
  await expect(page.getByText(classBody)).toHaveCount(0);
  await expect(page.getByText(cohortName)).toHaveCount(0);

  // Their banner shows the note they were sent, not the class's newer one.
  await page.goto('/dashboard');
  const courseBanner = page.getByRole('link', { name: /Latest notice/ });
  await expect(courseBanner).toContainText(courseWideBody);
  await expect(courseBanner).not.toContainText(classBody);
  await expect(courseBanner).toContainText('All notices');
});

test('an unread note counts on the dashboard and clears when the learner marks it read', async ({
  page,
  request,
}) => {
  // Its own course, so the only note this learner can see is the one under test and
  // the count is not whatever the previous tests left behind.
  const body = `E2E unread note ${run}: drafts are due Friday.`;
  const courseId = await createCourse(request, fixture.token, uniqueName('Unread Course'));
  createdCourses.push(courseId);
  const posted = await request.post(`/api/v1/courses/${courseId}/announcements`, {
    headers: { Authorization: `Bearer ${fixture.token}` },
    data: { body },
  });
  expect(posted.ok(), 'Posting the unread fixture note').toBeTruthy();

  const learner = await newLearner(request, 'unread');
  await enroll(request, learner.token, courseId);

  // 1. The dashboard banner leads with the note and says it is still unread.
  await signIn(page, learner.email, 'password123');
  await page.goto('/dashboard');
  const banner = page.getByRole('link', { name: /Latest notice/ });
  await expect(banner).toContainText(body);
  await expect(banner).toContainText('1 unread');

  // 2. The notices page marks the row itself, not just the banner, and the nav
  // badge carries the same number.
  await banner.click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByText('Unread', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*1 unread/ })).toBeVisible();

  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByText('All caught up')).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*unread/ })).toHaveCount(0);

  // 3. The read row is on the server, so a reload keeps the note read.
  await page.reload();
  await expect(page.getByText('All caught up')).toBeVisible();

  // 4. And the dashboard no longer counts it.
  await page.goto('/dashboard');
  const readBanner = page.getByRole('link', { name: /Latest notice/ });
  await expect(readBanner).toContainText(body);
  await expect(readBanner).not.toContainText('1 unread');
});

test('mark all read clears every notice, the badge and the reloaded page', async ({
  page,
  request,
}) => {
  // Its own quiet course and learner, so the count is only these two notes.
  const courseId = await createCourse(request, fixture.token, uniqueName('Catch Up Course'));
  createdCourses.push(courseId);
  for (const body of [`E2E catch up one ${run}`, `E2E catch up two ${run}`]) {
    const posted = await request.post(`/api/v1/courses/${courseId}/announcements`, {
      headers: { Authorization: `Bearer ${fixture.token}` },
      data: { body },
    });
    expect(posted.ok(), `Posting "${body}"`).toBeTruthy();
  }

  const learner = await newLearner(request, 'catchup');
  await enroll(request, learner.token, courseId);

  await signIn(page, learner.email, 'password123');
  await page.goto('/announcements');
  await expect(page.getByRole('link', { name: /Notices.*2 unread/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all read' })).toBeVisible();

  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('All caught up')).toBeVisible();
  await expect(page.getByText('2 notices marked read.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*unread/ })).toHaveCount(0);

  // The rows are on the server, so a reload keeps every note read.
  await page.reload();
  await expect(page.getByText('All caught up')).toBeVisible();
  await expect(page.getByText(`E2E catch up two ${run}`)).toBeVisible();

  // And the dashboard banner has nothing left to count.
  await page.goto('/dashboard');
  const banner = page.getByRole('link', { name: /Latest notice/ });
  await expect(banner).toContainText(`E2E catch up two ${run}`);
  await expect(banner).not.toContainText(/unread/);
});

test('the notices page narrows by course and to unread notes without moving the badge', async ({
  page,
  request,
}) => {
  // Two courses of its own, so each filter has one note to keep and one to hide.
  const firstCourse = await createCourse(request, fixture.token, uniqueName('Filter One'));
  const secondCourse = await createCourse(request, fixture.token, uniqueName('Filter Two'));
  createdCourses.push(firstCourse, secondCourse);
  const firstBody = `E2E filter one ${run}: first course note.`;
  const secondBody = `E2E filter two ${run}: second course note.`;
  for (const [courseId, body] of [
    [firstCourse, firstBody],
    [secondCourse, secondBody],
  ]) {
    const posted = await request.post(`/api/v1/courses/${courseId}/announcements`, {
      headers: { Authorization: `Bearer ${fixture.token}` },
      data: { body },
    });
    expect(posted.ok(), `Posting "${body}"`).toBeTruthy();
  }

  const learner = await newLearner(request, 'filters');
  await enroll(request, learner.token, firstCourse);
  await enroll(request, learner.token, secondCourse);

  await signIn(page, learner.email, 'password123');
  await page.goto('/announcements');
  await expect(page.getByText('2 notices')).toBeVisible();
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*2 unread/ })).toBeVisible();

  // One course narrows the list and its total; the unread pill and nav badge keep
  // counting the whole feed.
  await page.getByLabel('Filter notices by course').selectOption(String(firstCourse));
  await expect(page.getByText('1 notice')).toBeVisible();
  await expect(page.getByText(firstBody)).toBeVisible();
  await expect(page.getByText(secondBody)).toHaveCount(0);
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*2 unread/ })).toBeVisible();

  // Both filters together still leave the unread note in that course.
  await page.getByRole('checkbox', { name: 'Unread only' }).check();
  await expect(page.getByText(firstBody)).toBeVisible();

  // Back to every course under the unread filter.
  await page.getByLabel('Filter notices by course').selectOption('');
  await expect(page.getByText('2 notices')).toBeVisible();

  // Marking everything read clears the badge and leaves the unread feed empty.
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('All caught up')).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*unread/ })).toHaveCount(0);

  await page.reload();
  await page.getByRole('checkbox', { name: 'Unread only' }).check();
  await expect(page.getByText('No notices match these filters')).toBeVisible();
  await expect(page.getByRole('link', { name: /Notices.*unread/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('2 notices')).toBeVisible();
  await expect(page.getByText(firstBody)).toBeVisible();
  await expect(page.getByText(secondBody)).toBeVisible();
  await expect(page.getByText('All caught up')).toBeVisible();
});

test('both filters page past one page and a course filter hides Mark all read', async ({
  page,
  request,
}) => {
  // 25 notes in one course and two in another: the first page holds 20, so each
  // filtered list only becomes complete if Load more keeps the same filters.
  const courseNotes = 25;
  const otherNoteCount = 2;
  const totalNotes = courseNotes + otherNoteCount;
  const pageSize = 20;

  const post = async (courseId, body) => {
    const posted = await request.post(`/api/v1/courses/${courseId}/announcements`, {
      headers: { Authorization: `Bearer ${fixture.token}` },
      data: { body },
    });
    expect(posted.ok(), `Posting "${body}"`).toBeTruthy();
  };

  const firstCourse = await createCourse(request, fixture.token, uniqueName('Paging One'));
  const secondCourse = await createCourse(request, fixture.token, uniqueName('Paging Two'));
  createdCourses.push(firstCourse, secondCourse);

  for (let index = 1; index <= courseNotes; index += 1) {
    await post(firstCourse, `E2E page note ${String(index).padStart(2, '0')} ${run}.`);
  }
  await post(secondCourse, `E2E other note one ${run}.`);
  await post(secondCourse, `E2E other note two ${run}.`);

  const learner = await newLearner(request, 'paging');
  await enroll(request, learner.token, firstCourse);
  await enroll(request, learner.token, secondCourse);

  await signIn(page, learner.email, 'password123');
  await page.goto('/announcements');

  const rows = page.getByRole('main').getByRole('listitem');
  const courseFilter = page.getByLabel('Filter notices by course');
  const unreadFilter = page.getByRole('checkbox', { name: 'Unread only' });
  const loadMore = page.getByRole('button', { name: /Load \d+ more/ });
  const markAll = page.getByRole('button', { name: 'Mark all read' });
  const otherNotes = page.getByText(new RegExp(`E2E other note .+ ${run}`));

  await expect(page.getByText(`${totalNotes} notices`)).toBeVisible();
  await expect(rows).toHaveCount(pageSize);
  await expect(markAll).toBeVisible();

  // The course filter narrows to 25 notes, so five stay on the second page.
  await courseFilter.selectOption(String(firstCourse));
  await expect(page.getByText(`${courseNotes} notices`)).toBeVisible();
  await expect(rows).toHaveCount(pageSize);
  await expect(otherNotes).toHaveCount(0);
  await expect(markAll).toHaveCount(0);

  await loadMore.click();
  await expect(rows).toHaveCount(courseNotes);
  await expect(page.getByText(`${courseNotes} notices`)).toBeVisible();
  await expect(loadMore).toHaveCount(0);
  await expect(otherNotes).toHaveCount(0);
  await expect(markAll).toHaveCount(0);

  // The pill and nav badge still count the whole feed, not the filtered 25.
  await expect(page.getByText(`${totalNotes} unread`, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(`Notices.*${totalNotes} unread`) }),
  ).toBeVisible();

  // Adding unread to the course filter keeps the same restriction.
  await unreadFilter.check();
  await expect(page.getByText(`${courseNotes} notices`)).toBeVisible();
  await expect(rows).toHaveCount(pageSize);
  await expect(otherNotes).toHaveCount(0);
  await expect(markAll).toHaveCount(0);

  // Unread on its own holds every note, and pages it the same way.
  await courseFilter.selectOption('');
  await expect(page.getByText(`${totalNotes} notices`)).toBeVisible();
  await expect(rows).toHaveCount(pageSize);
  await expect(markAll).toBeVisible();

  await loadMore.click();
  await expect(rows).toHaveCount(totalNotes);
  await expect(loadMore).toHaveCount(0);
  await expect(otherNotes).toHaveCount(otherNoteCount);
});

test('the notices page turns away staff and a learner cannot post', async ({ page, request }) => {
  await signIn(page, INSTRUCTOR.email);
  await page.goto('/announcements');
  await expect(page.getByRole('heading', { name: 'This page is for learners.' })).toBeVisible();

  const learner = await newLearner(request, 'write');
  const response = await request.post(`/api/v1/courses/${fixture.courseId}/announcements`, {
    headers: { Authorization: `Bearer ${learner.token}` },
    data: { body: 'A learner should not be able to post this.' },
  });
  expect(response.status(), 'A learner posting a note is refused').toBe(403);
});

test('the studio receipts panel counts reads, lists and pages the unread names', async ({
  page,
  request,
}) => {
  test.setTimeout(600_000);
  const courseId = await createCourse(request, fixture.token, uniqueName('Receipts Course'));
  createdCourses.push(courseId);

  const pagingBody = `E2E receipts page ${run}: every name is listed.`;
  const readsBody = `E2E receipts reads ${run}: the roster is catching up.`;
  await postAnnouncement(request, courseId, pagingBody);
  const readsNote = await postAnnouncement(request, courseId, readsBody);

  const learners = await addReceiptLearners(request, courseId, 51);
  // Half the roster opens one note, so its count and percentage are partial.
  await markLearnersRead(request, learners.slice(0, 25), readsNote.id);

  await signIn(page, INSTRUCTOR.email);
  await page.goto(`/studio?course=${courseId}&step=publish`);

  const rowFor = (body) => page.getByRole('listitem').filter({ hasText: body });
  const pagingRow = rowFor(pagingBody);
  const pagingToggle = pagingRow.locator('button[aria-expanded]');
  const pagingNames = pagingRow.locator('li.chip');

  await expect(pagingToggle).toContainText('0 of 51 read');
  await expect(pagingToggle).toContainText('0%');

  await pagingToggle.click();
  await expect(pagingRow.getByText('Not read yet')).toBeVisible();
  await expect(pagingNames).toHaveCount(50);
  await expect(pagingRow.getByText('50 of 51 shown')).toBeVisible();
  // Names are ordered, so the 51st sits on the page that has not loaded yet.
  await expect(pagingRow.getByText('Receipt Learner 51', { exact: true })).toHaveCount(0);

  await pagingRow.getByRole('button', { name: 'Load more names' }).click();
  await expect(pagingNames).toHaveCount(51);
  await expect(pagingRow.getByText('Receipt Learner 51', { exact: true })).toBeVisible();
  await expect(pagingRow.getByText('50 of 51 shown')).toHaveCount(0);
  await expect(pagingRow.getByRole('button', { name: 'Load more names' })).toHaveCount(0);

  // A fresh mount picks up the reads recorded through the API above.
  await page.reload();
  const readsRow = rowFor(readsBody);
  const readsToggle = readsRow.locator('button[aria-expanded]');

  await expect(readsToggle).toContainText('25 of 51 read');
  await expect(readsToggle).toContainText('49%');

  await readsToggle.click();
  await expect(readsRow.getByText('Not read yet')).toBeVisible();
  await expect(readsRow.locator('li.chip')).toHaveCount(26);
  await expect(readsRow.getByRole('button', { name: 'Load more names' })).toHaveCount(0);

  // Once the rest read it, the panel has a list of nobody and says so.
  await markLearnersRead(request, learners.slice(25), readsNote.id);
  await page.reload();

  await expect(readsToggle).toContainText('51 of 51 read');
  await expect(readsToggle).toContainText('100%');

  await readsToggle.click();
  await expect(readsRow.getByText('Everyone it was sent to has read it.')).toBeVisible();
  await expect(readsRow.locator('li.chip')).toHaveCount(0);

  // The paging note is still untouched, so its count did not move with the other.
  await expect(pagingToggle).toContainText('0 of 51 read');
});

test('the studio receipts panel explains notes with nobody to read them', async ({
  page,
  request,
}) => {
  const courseId = await createCourse(request, fixture.token, uniqueName('Quiet Receipts'));
  createdCourses.push(courseId);

  const cohortResponse = await request.post(`/api/v1/courses/${courseId}/cohorts`, {
    headers: { Authorization: `Bearer ${fixture.token}` },
    data: { name: `Empty Class ${run}` },
  });
  expect(cohortResponse.ok(), 'Creating the empty class').toBeTruthy();
  const cohort = await cohortResponse.json();
  createdCohorts.push(cohort.id);

  const courseWideBody = `E2E empty audience ${run}: nobody is here yet.`;
  const classBody = `E2E empty class ${run}: nobody joined either.`;
  await postAnnouncement(request, courseId, courseWideBody);
  await postAnnouncement(request, courseId, classBody, cohort.id);

  await signIn(page, INSTRUCTOR.email);
  await page.goto(`/studio?course=${courseId}&step=publish`);

  const courseRow = page.getByRole('listitem').filter({ hasText: courseWideBody });
  const classRow = page.getByRole('listitem').filter({ hasText: classBody });

  await expect(courseRow.getByText('Nobody has enrolled on this course yet.')).toBeVisible();
  await expect(classRow.getByText(`Nobody has joined ${cohort.name} yet.`)).toBeVisible();
  // With no audience there is no count and no list to expand.
  await expect(courseRow.locator('button[aria-expanded]')).toHaveCount(0);
  await expect(classRow.locator('button[aria-expanded]')).toHaveCount(0);
});
