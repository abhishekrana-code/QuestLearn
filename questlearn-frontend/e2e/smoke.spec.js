import { expect, test } from '@playwright/test';

/**
 * Two journeys, end to end, through the real UI and the real API.
 *
 * <p>The first creates a brand-new account rather than borrowing a demo one: a smoke
 * test that signs in as a seeded user cannot catch a broken registration, and it
 * leaves the demo data alone. The account is unique per run, so a local database
 * simply collects a few test students.</p>
 *
 * <p>Every step is the thing a person would do: type the form, press Join course,
 * answer the quiz, then sign in as the teacher and find the name on the roster.</p>
 *
 * <p>The second is the other way into a course: the teacher makes a course members
 * only and reads out a class code, and a student who cannot find the course in the
 * catalogue joins with that code. It gates the second seeded course, never the one
 * the first test uses, and puts it back in the catalogue afterwards.</p>
 */

const run = Date.now();
const student = {
  name: `Smoke Student ${run}`,
  email: `smoke.${run}@questlearn.dev`,
  password: 'password123',
};
const INSTRUCTOR = { email: 'instructor@questlearn.dev', password: 'password123' };
const COURSE = 'Full-Stack Web Engineering Quest';
const GATED_COURSE = 'Data Structures Detour';
const gatedClass = { name: `12C Smoke ${run}` };
const classStudent = {
  name: `Class Code Student ${run}`,
  email: `classcode.${run}@questlearn.dev`,
  password: 'password123',
};

// Set while the gating test runs so cleanup can always restore the demo course.
let instructorToken = null;
let gatedCourseId = null;
let gatedCohortId = null;

test.beforeAll(async ({ request }) => {
  const health = await request.get('http://localhost:8091/actuator/health');
  expect(
    health.ok(),
    'The API is not answering on :8091. Start the backend jar before running the smoke suite.',
  ).toBeTruthy();
});

async function signIn(page, { email, password }) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function apiSignIn(request, { email, password }) {
  const response = await request.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.ok(), `Could not sign ${email} in through the API`).toBeTruthy();
  return (await response.json()).token;
}

async function signOut(page) {
  // Leave a page with a side panel first: on the skill tree the panel can sit over the
  // header, which makes the account button unclickable. "/" works for every role.
  await page.goto('/');
  // The account menu's accessible name is initials plus first name, e.g. "SS Smoke".
  // Matching on that leaves the theme buttons ("Light", "Dark", "System") alone.
  await page.getByRole('button', { name: /^[A-Z]{2} \S+$/ }).first().click();
  // Inside the dropdown, Sign out is a menu item, not a plain button.
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
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
  const card = page.locator('article').filter({ hasText: COURSE }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Join course' }).click();
  await expect(card.getByRole('button', { name: 'Continue' })).toBeVisible();

  // 3. Open it and clear the first node with the quiz the seeder wrote.
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/courses\/\d+/);
  // The tree draws each node twice (canvas and a "jump to node" list), so take the
  // first match by name rather than relying on a unique element.
  await page.getByRole('button', { name: /HTML Foundations/ }).first().click();

  // Options read as "B <article>": the letter is part of the accessible name.
  await page.getByRole('button', { name: 'B <article>' }).click();
  await page
    .getByRole('button', { name: 'B It supplies a text alternative for screen readers' })
    .click();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText('Node cleared')).toBeVisible();
  await expect(page.getByText(/Score 100%/)).toBeVisible();

  // 4. As the teacher, read the report: the new name is on the roster at 1/6.
  await signOut(page);
  await signIn(page, INSTRUCTOR);
  await page.goto('/studio/courses/1/roster');

  const row = page.locator('article').filter({ hasText: student.name }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('1/6 cleared')).toBeVisible();
      await expect(row.getByText(student.email)).toBeVisible();
});

test.afterAll(async ({ request }) => {
  if (!instructorToken) return;
  const headers = { Authorization: `Bearer ${instructorToken}` };
  if (gatedCohortId) {
    await request.delete(`/api/v1/cohorts/${gatedCohortId}`, { headers });
    gatedCohortId = null;
  }
  if (gatedCourseId) {
    await request.patch(
      `/api/v1/courses/${gatedCourseId}/members-only?membersOnly=false`,
      { headers },
    );
  }
});

test('a class code is the only way into a members-only course', async ({ page, request }) => {
  // 1. The teacher makes the second seeded course members only.
  instructorToken = await apiSignIn(request, INSTRUCTOR);
  const headers = { Authorization: `Bearer ${instructorToken}` };
  const courses = await (await request.get('/api/v1/courses', { headers })).json();
  const course = courses.find((item) => item.title === GATED_COURSE);
  expect(course, `The seed data must contain "${GATED_COURSE}"`).toBeTruthy();
  gatedCourseId = course.id;

  await signIn(page, INSTRUCTOR);
  await page.goto(`/studio/courses/${gatedCourseId}/cohorts`);
  await page.getByRole('switch', { name: 'Only let invited classes open this course' }).click();
  await expect(page.getByText('Members only', { exact: true })).toBeVisible();

  // 2. A class, with its code read back off the page the teacher sees.
  await page.getByLabel('Class name').fill(gatedClass.name);
  await page.getByRole('button', { name: 'Create class' }).click();
  const codeButton = page.getByRole('button', { name: `Copy the code for ${gatedClass.name}` });
  await expect(codeButton).toBeVisible();
  const joinCode = (await codeButton.innerText()).trim();
  expect(joinCode, 'A class code is eight unambiguous characters').toMatch(/^[A-Z0-9]{8}$/);

  const cohorts = await (
    await request.get(`/api/v1/courses/${gatedCourseId}/cohorts`, { headers })
  ).json();
  gatedCohortId = cohorts.find((item) => item.name === gatedClass.name)?.id;
  expect(gatedCohortId, 'The new class should exist on the server').toBeTruthy();

  // 3. A student who is not in the class can neither find nor open the course.
  await signOut(page);
  const registered = await request.post('/api/v1/auth/register', {
    data: {
      name: classStudent.name,
      email: classStudent.email,
      password: classStudent.password,
      role: 'STUDENT',
    },
  });
  expect(registered.status(), 'Signing a smoke student up through the API').toBe(201);
  await signIn(page, classStudent);

  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: GATED_COURSE })).toHaveCount(0);

  await page.goto(`/courses/${gatedCourseId}`);
  await expect(
    page.getByText('This course is only open to the class it was created for'),
  ).toBeVisible();

  // 4. The code does both jobs: class list and enrolment.
  await page.goto('/explore');
  await page.getByLabel('Class code').fill(joinCode);
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.getByText(/You joined .*is now on your dashboard/)).toBeVisible();

  const card = page.locator('article').filter({ hasText: GATED_COURSE }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${gatedCourseId}$`));
  await expect(page.getByText('Jump to node')).toBeVisible();
});
