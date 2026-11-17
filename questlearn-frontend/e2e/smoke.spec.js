import { expect, test } from '@playwright/test';
import {
  ADMIN,
  INSTRUCTOR,
  addNode,
  createCourse,
  deleteUserByEmail,
  demoPassword,
  instructorToken,
  registerLearner,
  removeCourse,
  uniqueName,
} from './fixtures.js';

/**
 * Two journeys, end to end, through the real UI and the real API.
 *
 * <p>Both build their own courses and nodes, so a fresh database behaves exactly
 * like a demo that visitors have been using. Accounts are unique per run and are
 * deleted again in `afterAll`.</p>
 *
 * <p>The first sign-up journey creates a brand-new account rather than borrowing a
 * demo one: a smoke test that signs in as a seeded user cannot catch a broken
 * registration. Every step is the thing a person would do: type the form, press
 * Join course, answer the quiz, then sign in as the teacher and find the name on
 * the roster.</p>
 *
 * <p>The second is the other way into a course: the teacher makes a course members
 * only and reads out a class code, and a student who cannot find the course in the
 * catalogue joins with that code.</p>
 */

const run = Date.now();
const student = {
  name: `Smoke Student ${run}`,
  email: `smoke.${run}@questlearn.dev`,
  password: 'password123',
};
const classStudent = {
  name: `Class Code Student ${run}`,
  email: `classcode.${run}@questlearn.dev`,
  password: 'password123',
};
const gatedClass = { name: `12C Smoke ${run}` };

// Filled in by beforeAll: ids and titles of the courses this suite owns.
let fixture = null;
// Set while the gating test runs so cleanup can always remove the class.
let gatedCohortId = null;

test.beforeAll(async ({ request }) => {
  const health = await request.get('http://localhost:8091/actuator/health');
  expect(
    health.ok(),
    'The API is not answering on :8091. Start the backend jar before running the smoke suite.',
  ).toBeTruthy();

  const token = await instructorToken(request);
  const courseTitle = uniqueName('Smoke Course');
  const courseId = await createCourse(request, token, courseTitle);
  const nodeId = await addNode(request, token, courseId, { title: 'HTML Foundations' });
  const gatedTitle = uniqueName('Gated Course');
  const gatedCourseId = await createCourse(request, token, gatedTitle);
  await addNode(request, token, gatedCourseId, { title: 'Arrays' });

  fixture = { token, courseTitle, courseId, nodeId, gatedTitle, gatedCourseId };
});

test.afterAll(async ({ request }) => {
  // A failed beforeAll leaves no fixture, and the cleanup would then throw a
  // TypeError about it instead of showing the error that actually broke the run.
  if (!fixture) return;

  // Every account this suite made is removed again, so the leaderboard and the
  // admin list do not fill up with "Smoke Student …" rows. Their progress has to go
  // with them: a course with progress cannot be deleted.
  for (const email of [student.email, classStudent.email]) {
    await deleteUserByEmail(request, email);
  }

  const token = await instructorToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  if (gatedCohortId) {
    await request.delete(`/api/v1/cohorts/${gatedCohortId}`, { headers });
    gatedCohortId = null;
  }
  await removeCourse(request, token, fixture.gatedCourseId);
  await removeCourse(request, token, fixture.courseId);
});

async function signIn(page, { email, password }) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page) {
  // Leave a page with a side panel first: on the skill tree the panel can sit over the
  // header, which makes the account button unclickable. "/" works for every role.
  await page.goto('/');
  // The account menu's accessible name is initials plus first name, e.g. "SS Smoke".
  // Matching on that leaves the theme buttons ("Light", "Dark", "System") alone.
  const account = page.getByRole('button', { name: /^[A-Z]{2} \S+$/ }).first();
  const signOutItem = page.getByRole('menuitem', { name: 'Sign out' });
  // The dashboard's last fetch can land while the menu is open and re-render the
  // header, detaching the item. Re-opened rather than waited on, so a slow reply
  // does not turn into a 90-second timeout.
  for (let attempt = 0; attempt < 3; attempt++) {
    await account.click();
    try {
      await signOutItem.click({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await expect(page).toHaveURL(/\/login/);
}

test('a new student signs up, joins a course, clears a node, and reaches the roster', async ({
  page,
}) => {
  // 1. Sign up through the form.
  await page.goto('/register');
  // By id: the password field's label also carries a "Show password" button, which
  // makes label-based lookup ambiguous.
  await page.locator('#name').fill(student.name);
  await page.locator('#email').fill(student.email);
  await page.locator('#password').fill(student.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();

  // 2. Join the course from the catalogue.
  await page.goto('/explore');
  const card = page.locator('article').filter({ hasText: fixture.courseTitle }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Join course' }).click();
  await expect(card.getByRole('button', { name: 'Continue' })).toBeVisible();

  // 3. Open it and clear the first node with the quiz the suite attached.
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${fixture.courseId}$`));
  // The tree draws each node twice (canvas and a "jump to node" list), so take the
  // first match by name rather than relying on a unique element.
  await page.getByRole('button', { name: /HTML Foundations/ }).first().click();

  // Options read as "B <article>": the letter is part of the accessible name.
  await page.getByRole('button', { name: 'B <article>' }).click();
  await page
    .getByRole('button', { name: 'B It supplies a text alternative for screen readers' })
    .click();
  // The hint belongs to an unanswered question; after the second answer it must go.
  await expect(page.getByText('Pick one answer to continue.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText('Node cleared')).toBeVisible();
  await expect(page.getByText(/Score 100%/)).toBeVisible();

  // 4. As the teacher, read the report: the new name is on the roster at 1/1.
  await signOut(page);
  await signIn(page, { email: INSTRUCTOR.email, password: demoPassword() });
  await page.goto(`/studio/courses/${fixture.courseId}/roster`);

  const row = page.locator('article').filter({ hasText: student.name }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('1/1 cleared')).toBeVisible();
  await expect(row.getByText(student.email)).toBeVisible();
});

test('a class code is the only way into a members-only course', async ({ page, request }) => {
  // 1. The teacher makes the second fixture course members only.
  const headers = { Authorization: `Bearer ${fixture.token}` };

  await signIn(page, { email: INSTRUCTOR.email, password: demoPassword() });
  await page.goto(`/studio/courses/${fixture.gatedCourseId}/cohorts`);
  await page.getByRole('switch', { name: 'Open to the catalogue' }).click();
  await expect(
    page.getByText(/only students who type one of your class codes/),
  ).toBeVisible();

  // 2. A class, with its code read back off the page the teacher sees.
  await page.getByLabel('Class name').fill(gatedClass.name);
  await page.getByRole('button', { name: 'Create class' }).click();
  const codeButton = page.getByRole('button', { name: `Copy the code for ${gatedClass.name}` });
  await expect(codeButton).toBeVisible();
  const joinCode = (await codeButton.innerText()).trim();
  expect(joinCode, 'A class code is eight unambiguous characters').toMatch(/^[A-Z0-9]{8}$/);

  const cohorts = await (
    await request.get(`/api/v1/courses/${fixture.gatedCourseId}/cohorts`, { headers })
  ).json();
  gatedCohortId = cohorts.find((item) => item.name === gatedClass.name)?.id;
  expect(gatedCohortId, 'The new class should exist on the server').toBeTruthy();

  // 3. A student who is not in the class can neither find nor open the course.
  await signOut(page);
  await registerLearner(request, classStudent);
  await signIn(page, classStudent);

  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: fixture.gatedTitle })).toHaveCount(0);

  await page.goto(`/courses/${fixture.gatedCourseId}`);
  await expect(
    page.getByText('This course is only open to the class it was created for'),
  ).toBeVisible();

  // 4. The code does both jobs: class list and enrolment.
  await page.goto('/explore');
  await page.getByLabel('Class code').fill(joinCode);
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.getByText(/You joined .*is now on your dashboard/)).toBeVisible();

  const card = page.locator('article').filter({ hasText: fixture.gatedTitle }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${fixture.gatedCourseId}$`));
  await expect(page.getByText('Jump to node')).toBeVisible();
});
