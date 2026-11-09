import api from './api.js';

/** Whether the server has a Groq key configured, plus the model names in use. */
export async function getAiStatus() {
  const { data } = await api.get('/ai/status');
  return data;
}

/**
 * Uploads a recorded viva answer. The backend streams it to Groq whisper for
 * transcription and to the reasoning model for grading; nothing is stored.
 */
export async function submitViva(moduleId, { audio, filename, durationMs }) {
  const form = new FormData();
  form.append('audio', audio, filename ?? 'viva.webm');
  if (durationMs != null) form.append('durationMs', String(Math.round(durationMs)));

  const { data } = await api.post(`/modules/${moduleId}/viva`, form, {
    // The axios instance defaults to application/json; clearing it here lets the
    // browser set multipart/form-data *with its boundary*, which the upload needs.
    headers: { 'Content-Type': undefined },
    timeout: 120_000,
  });
  return data;
}

/** Drafts a whole quest (nodes + quizzes) from a topic prompt. */
export async function generateCourse({ topic, audience, category, nodeCount }) {
  const { data } = await api.post(
    '/ai/courses',
    { topic, audience, category, nodeCount },
    { timeout: 180_000 },
  );
  return data;
}
