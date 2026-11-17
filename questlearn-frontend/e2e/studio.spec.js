import { expect, test } from '@playwright/test';
import {
  INSTRUCTOR,
  addNode,
  clearNode,
  createCourse,
  deleteUserByEmail,
  enroll,
  instructorToken,
  registerLearner,
  removeCourse,
  skillTree,
  uniqueName,
} from './fixtures.js';
import { demoPassword } from './fixtures.js';

async function signIn(page, email = INSTRUCTOR.email) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(demoPassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Every test below builds the course it reads and deletes it again, so the studio
// pages can be checked on a fresh database and on a demo someone has been using.

test('a disabled delete explains itself to keyboard users', async ({ page, request }) => {
  const token = await instructorToken(request);
  const title = uniqueName('delete');
  const courseId = await createCourse(request, token, title);

  try {
    await signIn(page);
    await page.goto('/studio/courses');

    const card = page.locator('article').filter({ hasText: title });
    const remove = card.getByRole('button', { name: 'Delete course (unpublish it first)' });
    await expect(remove).toBeVisible();
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await remove.focus();
    await expect(remove).toBeFocused();
    // Playwright refuses to click an element it reads as disabled, which is the
    // point of aria-disabled; the browser itself still delivers the click.
    await remove.evaluate((node) => node.click());
    await expect(page.getByText(/Unpublish it first, then delete/)).toBeVisible();

    await page.screenshot({ path: 'test-results/course-delete-reason.png', fullPage: false });
  } finally {
    await removeCourse(request, token, courseId);
  }
});

test('the node form places new nodes without pixel maths', async ({ page, request }) => {
  const token = await instructorToken(request);
  const courseId = await createCourse(request, token, uniqueName('nodes'), { published: false });

  try {
    await signIn(page);
    await page.goto(`/studio?course=${courseId}&step=nodes`);

    await expect(page.locator('#module-x')).toHaveValue('90');
    await expect(page.locator('#module-y')).toHaveValue('90');
    await expect(page.getByText(/placed on the map automatically/i)).toBeVisible();
    await expect(page.getByLabel('Horizontal position')).toBeVisible();
  } finally {
    await removeCourse(request, token, courseId);
  }
});

test('resetting a learner uses the app dialog, not window.confirm', async ({ page, request }) => {
  const token = await instructorToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const courseId = await createCourse(request, token, uniqueName('reset'));
  // The reset control only appears on a node the learner actually worked on, so the
  // fixture clears one rather than hunting the demo for a learner who did.
  const nodeId = await addNode(request, token, courseId, { title: 'Fixture Reset Node' });
  const learner = {
    name: uniqueName('Reset Learner'),
    email: `fixture.reset.${Date.now()}@questlearn.dev`,
  };

  try {
    const learnerToken = await registerLearner(request, learner);
    await enroll(request, learnerToken, courseId);
    await skillTree(request, learnerToken, courseId);
    await clearNode(request, learnerToken, nodeId);

    const roster = await (
      await request.get(`/api/v1/courses/${courseId}/roster`, { headers })
    ).json();
    const row = (roster.learners ?? []).find((item) => item.email === learner.email);
    expect(row, 'The fixture learner should be on the roster with cleared work').toBeTruthy();
    expect(row.clearedNodes).toBe(1);

    await signIn(page);
    await page.goto(`/studio/courses/${courseId}/roster/${row.userId}`);

    await page.getByRole('button', { name: 'Reset' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('returns to where it started');
    await expect(page.getByRole('button', { name: 'Reset node' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    // Progress blocks deleting a course, so the learner goes first.
    await deleteUserByEmail(request, learner.email);
    await removeCourse(request, token, courseId);
  }
});

test('the three analytics links now share one phrase', async ({ page, request }) => {
  const token = await instructorToken(request);
  const courseId = await createCourse(request, token, uniqueName('analytics'), { published: false });

  try {
    await signIn(page);
    await page.goto(`/studio/courses/${courseId}/analytics`);
    await expect(page.getByText(/Where learners stop\./)).toBeVisible();

    await page.goto(`/studio/courses/${courseId}/roster`);
    await expect(page.getByRole('link', { name: 'Where learners stop' })).toBeVisible();

    await page.goto(`/studio/courses/${courseId}/cohorts`);
    await expect(page.getByRole('link', { name: 'Where learners stop' })).toBeVisible();
  } finally {
    await removeCourse(request, token, courseId);
  }
});
