import { expect, test } from '@playwright/test';
import {
  addNode,
  createCourse,
  deleteUserByEmail,
  enroll,
  instructorToken,
  registerLearner,
  removeCourse,
  skillTree,
  uniqueName,
} from './fixtures.js';

/**
 * The dashboard card and the stale-node message used to be read off the seeded
 * student's progress, which only holds while nobody has played the demo since.
 * These tests make their own learner with one uncleared node in their own course.
 */

let fixture = null;

test.beforeAll(async ({ request }) => {
  const token = await instructorToken(request);
  const courseId = await createCourse(request, token, uniqueName('next'));
  const nodeId = await addNode(request, token, courseId, { title: 'Fixture Start' });
  const learner = {
    name: uniqueName('Next Learner'),
    email: `fixture.next.${Date.now()}@questlearn.dev`,
    password: 'password123',
  };
  const learnerToken = await registerLearner(request, learner);
  await enroll(request, learnerToken, courseId);
  // Opening the tree is what creates and unlocks their progress rows.
  await skillTree(request, learnerToken, courseId);
  fixture = { token, courseId, nodeId, learner };
});

test.afterAll(async ({ request }) => {
  if (!fixture) return;
  await deleteUserByEmail(request, fixture.learner.email);
  await removeCourse(request, fixture.token, fixture.courseId);
});

async function signIn(page, learner) {
  await page.goto('/login');
  await page.locator('#email').fill(learner.email);
  await page.locator('#password').fill(learner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('h1')).toContainText('Good to see you');
}

test('the dashboard continue card deep-links into the next node', async ({ page }) => {
  await signIn(page, fixture.learner);

  const card = page.getByRole('link', { name: /Pick up here/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute(
    'href',
    `/courses/${fixture.courseId}?node=${fixture.nodeId}`,
  );

  // The card must name real work, not an empty promise.
  await expect(card).toContainText(/XP/);

  const detail = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/modules/${fixture.nodeId}`) && response.status() === 200,
  );
  await card.click();
  await detail;
  await expect(page).not.toHaveURL(/node=/);
  await expect(page.getByText('Ready to play').first()).toBeVisible();
});

test('a stale node parameter explains itself instead of failing silently', async ({ page }) => {
  await signIn(page, fixture.learner);

  await page.goto(`/courses/${fixture.courseId}?node=999999`);
  await expect(page.getByText('That node is not part of this course any more.')).toBeVisible();
  await expect(page).not.toHaveURL(/node=/);
});
