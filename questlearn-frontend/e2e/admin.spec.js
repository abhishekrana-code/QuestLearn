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

test('the health card counts the server and lists real latencies', async ({ page, request }) => {
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'admin@questlearn.dev', password: demoPassword() },
  });
  const { token } = await login.json();
  const telemetry = await (
    await request.get('/api/v1/admin/telemetry', {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();

  expect(telemetry.requests).toBeGreaterThan(1);
  expect(telemetry.p50Ms).toBeTruthy();
  expect(telemetry.p50Ms).toBeLessThan(5000);
  expect(telemetry.p99Ms).toBeGreaterThanOrEqual(telemetry.p50Ms);

  await signIn(page, 'admin@questlearn.dev');
  await page.goto('/admin');
  await expect(page.getByText('Requests since restart')).toBeVisible();
  await expect(page.getByText('p50 latency')).toBeVisible();
  await expect(page.getByText('5000 ms')).toHaveCount(0);
});

test('demo logins names the accounts instead of only counting them', async ({ page, request }) => {
  // The card must show what the server reports rather than a list the page keeps for
  // itself, so the expectation comes from the same endpoint the page reads.
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'admin@questlearn.dev', password: demoPassword() },
  });
  const { token } = await login.json();
  const status = await (
    await request.get('/api/v1/admin/demo-password', {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const emails = (status.logins ?? []).map((entry) => entry.email);
  expect(emails.length, 'The server reports at least one demo login').toBeGreaterThan(0);

  await signIn(page, 'admin@questlearn.dev');
  await page.goto('/admin');

  const card = page.getByRole('region', { name: 'Demo logins' });
  await expect(card).toBeVisible();
  for (const email of emails) {
    await expect(card.getByText(email)).toBeVisible();
  }
});

test('the accessibility page only claims what the forms do', async ({ page }) => {
  await page.goto('/accessibility');

  await expect(page.getByText(/Sign-in ties a failure to the email and password fields/)).toBeVisible();
  await expect(page.getByText(/errors are announced and tied to the field/)).toHaveCount(0);
});
