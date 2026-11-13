import { expect, test } from '@playwright/test';

/**
 * One journey, end to end, through the real UI and the real API.
 *
 * <p>It creates a brand-new account rather than borrowing a demo one: a smoke test
 * that signs in as a seeded user cannot catch a broken registration, and it leaves
 * the demo data alone. The account is unique per run, so a local database simply
 * collects a few test students.</p>
 *
 * <p>Every step is the thing a person would do: type the form, press Join course,
 * answer the quiz, then sign in as the teacher and find the name on the roster.</p>
 */

const run = Date.now();
const student = {
  name: `Smoke Student ${run}`,
  email: `smoke.${run}@questlearn.dev`,
  password: 'password123',
};
const INSTRUCTOR = { email: 'instructor@questlearn.dev', password: 'password123' };
const COURSE = 'Full-Stack Web Engineering Quest';

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

async function signOut(page) {
  // Leave a page with a side panel first: on the skill tree the panel can sit over the
  // header, which makes the account button unclickable.
  await page.goto('/dashboard');
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
