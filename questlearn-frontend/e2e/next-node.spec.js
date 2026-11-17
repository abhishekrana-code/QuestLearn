import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/** Same contract as the smoke suite: the password lives in the root .env. */
function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const envPath = path.resolve(process.cwd(), '..', '.env');
  const match = fs.readFileSync(envPath, 'utf8').match(/^DEMO_PASSWORD=(.*)$/m);
  if (!match) throw new Error('DEMO_PASSWORD missing');
  return match[1].trim().replace(/^"|"$/g, '');
}

test('the dashboard continue card deep-links into the next node', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('student@questlearn.dev');
  await page.locator('#password').fill(demoPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('h1')).toContainText('Good to see you');

  const card = page.getByRole('link', { name: /Pick up here/i });
  await expect(card).toBeVisible();
  const href = await card.getAttribute('href');
  expect(href).toMatch(/^\/courses\/\d+\?node=\d+$/);
  const nodeId = new URL(href, 'http://localhost:5180').searchParams.get('node');

  // The card must name real work, not an empty promise.
  await expect(card).toContainText(/XP/);

  const detail = page.waitForResponse(
    (response) => response.url().includes(`/api/v1/modules/${nodeId}`) && response.status() === 200,
  );
  await card.click();
  await detail;
  await expect(page).not.toHaveURL(/node=/);
  await expect(page.getByText('Ready to play').first()).toBeVisible();
});

test('a stale node parameter explains itself instead of failing silently', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('student@questlearn.dev');
  await page.locator('#password').fill(demoPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('h1')).toContainText('Good to see you');

  await page.screenshot({ path: 'test-results/next-card.png', fullPage: true });

  const courseHref = await page
    .locator('a[href^="/courses/"]')
    .first()
    .getAttribute('href');
  await page.goto(`${courseHref}?node=999999`);
  await expect(page.getByText('That node is not part of this course any more.')).toBeVisible();
  await expect(page).not.toHaveURL(/node=/);
});
