import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The seeded accounts can be rotated with DEMO_PASSWORD (DataInitializer rewrites
 * them on start), so the teacher login reads the same root .env the backend does
 * instead of assuming the published default.
 *
 * <p>There is no fallback password on purpose. A database seeded without
 * DEMO_PASSWORD gets a random password, so guessing one only produces a confusing
 * login timeout; failing here says what is actually wrong.</p>
 */
function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
  try {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DEMO_PASSWORD=(.*)$/m);
    const value = match?.[1]?.trim();
    if (value) return value;
  } catch {
    /* no root .env: reported below */
  }
  throw new Error(
    'DEMO_PASSWORD is not set and no root .env provides one, so the smoke suite cannot sign in as the seeded instructor. Set DEMO_PASSWORD in the environment or in the root .env.',
  );
}

/**
 * Two journeys, end to end, through the real UI and the real API.
 *
 * <p>The first creates a brand-new account rather than borrowing a demo one: a smoke
 * test that signs in as a seeded user cannot catch a broken registration. The
 * account is unique per run and deleted again afterwards, so the leaderboard and
 * roster no longer collect smoke accounts.</p>
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
const INSTRUCTOR = { email: 'instructor@questlearn.dev', password: demoPassword() };
const ADMIN = { email: 'admin@questlearn.dev', password: demoPassword() };
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
  // The hint belongs to an unanswered question; after the second answer it must go.
  await expect(page.getByText('Pick one answer to continue.')).toHaveCount(0);
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
  // Every account this suite made is removed again, so the leaderboard and the
  // admin list do not fill up with "Smoke Student 1794…" rows.
  try {
    const adminToken = await apiSignIn(request, ADMIN);
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    for (const address of [student.email, classStudent.email]) {
      const found = await (
        await request.get(`/api/v1/admin/users?query=${encodeURIComponent(address)}`, {
          headers: adminHeaders,
        })
      ).json();
      const match = (found.users ?? []).find((user) => user.email === address);
      if (match) {
        await request.delete(`/api/v1/admin/users/${match.id}`, { headers: adminHeaders });
      }
    }
  } catch {
    // A cleanup failure should not turn a green journey red; the API rejects a
    // deleted admin, for example, and that is already visible elsewhere.
  }

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
