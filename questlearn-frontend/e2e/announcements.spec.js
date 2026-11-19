import { expect, test } from '@playwright/test';
import {
  INSTRUCTOR,
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

  for (const email of createdEmails) {
    await deleteUserByEmail(request, email);
  }

  const headers = { Authorization: `Bearer ${fixture.token}` };
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

  // 2. The notices page marks the row itself, not just the banner.
  await banner.click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByText('Unread', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByText('All caught up')).toBeVisible();

  // 3. The read row is on the server, so a reload keeps the note read.
  await page.reload();
  await expect(page.getByText('All caught up')).toBeVisible();

  // 4. And the dashboard no longer counts it.
  await page.goto('/dashboard');
  const readBanner = page.getByRole('link', { name: /Latest notice/ });
  await expect(readBanner).toContainText(body);
  await expect(readBanner).not.toContainText('1 unread');
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
