import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const envPath = path.resolve(process.cwd(), '..', '.env');
  const match = fs.readFileSync(envPath, 'utf8').match(/^DEMO_PASSWORD=(.*)$/m);
  if (!match) throw new Error('DEMO_PASSWORD missing');
  return match[1].trim().replace(/^"|"$/g, '');
}

async function signIn(page, email) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(demoPassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('a disabled delete explains itself to keyboard users', async ({ page }) => {
  await signIn(page, 'instructor@questlearn.dev');
  await page.goto('/studio/courses');

  const remove = page.getByRole('button', { name: 'Delete course (unpublish it first)' }).first();
  await expect(remove).toBeVisible();
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await remove.focus();
  await expect(remove).toBeFocused();
  // Playwright refuses to click an element it reads as disabled, which is the
  // point of aria-disabled; the browser itself still delivers the click.
  await remove.evaluate((node) => node.click());
  await expect(page.getByText(/Unpublish it first, then delete/)).toBeVisible();

  await page.screenshot({ path: 'test-results/course-delete-reason.png', fullPage: false });
});

test('the node form places new nodes without pixel maths', async ({ page }) => {
  await signIn(page, 'instructor@questlearn.dev');
  await page.goto('/studio?course=1&step=nodes');

  await expect(page.locator('#module-x')).toHaveValue('90');
  await expect(page.locator('#module-y')).toHaveValue('90');
  await expect(page.getByText(/placed on the map automatically/i)).toBeVisible();
  await expect(page.getByLabel('Horizontal position')).toBeVisible();
});

test('resetting a learner uses the app dialog, not window.confirm', async ({ page, request }) => {
  const token = (
    await (
      await request.post('/api/v1/auth/login', {
        data: { email: 'instructor@questlearn.dev', password: demoPassword() },
      })
    ).json()
  ).token;
  const headers = { Authorization: `Bearer ${token}` };
  const roster = await (await request.get('/api/v1/courses/1/roster', { headers })).json();
  const learner = roster.learners.find((item) => item.clearedNodes > 0);

  expect(learner, 'the demo roster must still contain cleared work').toBeTruthy();
  await signIn(page, 'instructor@questlearn.dev');
  await page.goto(`/studio/courses/1/roster/${learner.userId}`);

  await page.getByRole('button', { name: 'Reset' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('returns to where it started');
  await expect(page.getByRole('button', { name: 'Reset node' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the three analytics links now share one phrase', async ({ page }) => {
  await signIn(page, 'instructor@questlearn.dev');
  await page.goto('/studio/courses/1/analytics');
  await expect(page.getByText(/Where learners stop\./)).toBeVisible();

  await page.goto('/studio/courses/1/roster');
  await expect(page.getByRole('link', { name: 'Where learners stop' })).toBeVisible();

  await page.goto('/studio/courses/1/cohorts');
  await expect(page.getByRole('link', { name: 'Where learners stop' })).toBeVisible();
});
