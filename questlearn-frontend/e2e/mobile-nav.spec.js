import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// A phone, not a narrow desktop: the menu only exists below `md`.
test.use({ viewport: { width: 390, height: 844 } });

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

test('the close button in the mobile menu actually closes it', async ({ page }) => {
  await signIn(page, 'student@questlearn.dev');

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();

  // Regression: pointerdown closed the panel, then the click toggled it back
  // open, so the X appeared to do nothing.
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.locator('#mobile-nav')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();

  // The toggle must still open the menu again afterwards.
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();
});

test('tapping outside still closes the mobile menu', async ({ page }) => {
  await signIn(page, 'student@questlearn.dev');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-nav')).toBeVisible();

  await page.getByRole('heading', { name: /Good to see you/ }).click();
  await expect(page.locator('#mobile-nav')).toHaveCount(0);
});
