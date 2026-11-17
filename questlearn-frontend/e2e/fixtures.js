import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

/**
 * Fixtures for the browser suite.
 *
 * <p>Every spec asserts on data it created here and deletes again in `afterAll`.
 * Seeded demo content is only read where the test is about the demo itself (the
 * published accounts behind the login screen); course ids, rosters and progress
 * are never borrowed from whatever a previous run or a visitor left behind. A
 * fresh database, or a demo someone has been playing with, behaves the same.</p>
 *
 * <p>Courses need a unique title per run because the catalogue and the studio list
 * every course. Cleanup order matters: progress and attempts block
 * `DELETE /courses/{id}`, so the fixture learner is removed first, which also
 * clears their rows, and only then is the course unpublished and deleted.</p>
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** Same contract as the backend: the seeded password lives in the root .env. */
export function demoPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const envPath = path.resolve(here, '../../.env');
  try {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DEMO_PASSWORD=(.*)$/m);
    const value = match?.[1]?.trim().replace(/^"|"$/g, '');
    if (value) return value;
  } catch {
    /* no root .env: reported below */
  }
  throw new Error(
    'DEMO_PASSWORD is not set and no root .env provides one, so the suite cannot sign in as the seeded accounts. Set DEMO_PASSWORD in the environment or in the root .env.',
  );
}

export const INSTRUCTOR = { email: 'instructor@questlearn.dev' };
export const ADMIN = { email: 'admin@questlearn.dev' };
export const STUDENT = { email: 'student@questlearn.dev' };

export function uniqueName(label) {
  return `E2E ${label} ${Date.now().toString(36)}`;
}

export async function apiSignIn(request, email, password = demoPassword()) {
  const response = await request.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.ok(), `Could not sign ${email} in through the API`).toBeTruthy();
  return (await response.json()).token;
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/** The instructor who owns every fixture course. */
export async function instructorToken(request) {
  return apiSignIn(request, INSTRUCTOR.email);
}

export async function createCourse(request, token, title, { published = true } = {}) {
  // New courses are always drafts; "published" in the body is applied separately so
  // the catalogue sees them and learners are allowed to join.
  const response = await request.post('/api/v1/courses', {
    headers: authHeaders(token),
    data: {
      title,
      description: 'Created by the browser suite and deleted afterwards.',
      category: 'Testing',
      emoji: '🧪',
    },
  });
  expect(response.status(), `Creating the fixture course "${title}"`).toBe(201);
  const courseId = (await response.json()).id;
  if (published) await publish(request, token, courseId, true);
  return courseId;
}

/**
 * Two questions with the second option correct, which is the shape the quiz UI
 * drives. The wording matches the seeded lesson so the selectors stay readable.
 */
export async function addNode(request, token, courseId, { title = 'Fixture Node', quiz = true } = {}) {
  const response = await request.post(`/api/v1/courses/${courseId}/modules`, {
    headers: authHeaders(token),
    data: {
      title,
      summary: 'A node the suite made.',
      content: {
        sections: [{ heading: 'Why', body: 'So the test does not borrow seeded lessons.' }],
      },
      xpReward: 100,
      positionX: 90,
      positionY: 90,
      orderIndex: 0,
      parentModuleId: null,
    },
  });
  expect(response.status(), `Adding a node to course ${courseId}`).toBe(201);
  const node = await response.json();

  if (quiz) {
    const quizResponse = await request.post(`/api/v1/modules/${node.id}/quiz`, {
      headers: authHeaders(token),
      data: {
        type: 'MULTIPLE_CHOICE',
        passingScore: 60,
        payload: {
          questions: [
            {
              id: 'fixture-q1',
              prompt: 'Which element is intended for a self-contained piece of content?',
              options: ['<div>', '<article>', '<span>', '<table>'],
              correctIndex: 1,
              explanation: '<article> marks content that would still make sense on its own.',
            },
            {
              id: 'fixture-q2',
              prompt: 'What is the main purpose of the alt attribute on an image?',
              options: [
                'It adds a hover tooltip',
                'It supplies a text alternative for screen readers',
                'It compresses the image',
                'It sets the image caption',
              ],
              correctIndex: 1,
              explanation: 'Assistive technology announces alt text when the image cannot be seen.',
            },
          ],
        },
      },
    });
    expect(quizResponse.ok(), `Attaching a quiz to node ${node.id}`).toBeTruthy();
  }

  return node.id;
}

export async function publish(request, token, courseId, published) {
  const response = await request.patch(`/api/v1/courses/${courseId}/publish?published=${published}`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `Setting course ${courseId} published=${published}`).toBeTruthy();
}

export async function registerLearner(request, { name, email, password = 'password123' }) {
  const response = await request.post('/api/v1/auth/register', {
    data: { name, email, password, role: 'STUDENT' },
  });
  expect(response.status(), `Registering ${email} through the API`).toBe(201);
  // Registration answers with the account, not a session, so sign in for the token.
  return apiSignIn(request, email, password);
}

export async function enroll(request, token, courseId) {
  const response = await request.post(`/api/v1/courses/${courseId}/enroll`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `Joining course ${courseId}`).toBeTruthy();
}

/** Opening the tree is what creates the learner's progress rows. */
export async function skillTree(request, token, courseId) {
  const response = await request.get(`/api/v1/courses/${courseId}/skill-tree`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `Reading the skill tree for course ${courseId}`).toBeTruthy();
  return response.json();
}

/** Clears the fixture node, so the roster has something to report on. */
export async function clearNode(request, token, nodeId) {
  const response = await request.post(`/api/v1/modules/${nodeId}/complete`, {
    headers: authHeaders(token),
    data: {
      answers: [
        { questionId: 'fixture-q1', selectedIndex: 1 },
        { questionId: 'fixture-q2', selectedIndex: 1 },
      ],
    },
  });
  expect(response.ok(), `Clearing node ${nodeId}`).toBeTruthy();
  return response.json();
}

export async function deleteUserByEmail(request, email) {
  const admin = await apiSignIn(request, ADMIN.email);
  const headers = authHeaders(admin);
  const found = await (
    await request.get(`/api/v1/admin/users?query=${encodeURIComponent(email)}`, { headers })
  ).json();
  const match = (found.users ?? []).find((user) => user.email === email);
  if (!match) return false;
  const response = await request.delete(`/api/v1/admin/users/${match.id}`, { headers });
  expect(response.ok(), `Deleting ${email}`).toBeTruthy();
  return true;
}

/**
 * Removes a fixture course. Call it after deleting any learner who worked in it,
 * because a course with progress cannot be deleted by design.
 */
export async function removeCourse(request, token, courseId) {
  if (!courseId) return;
  await publish(request, token, courseId, false);
  const response = await request.delete(`/api/v1/courses/${courseId}`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `Deleting fixture course ${courseId}`).toBeTruthy();
}
