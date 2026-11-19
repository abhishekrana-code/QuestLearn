import api from './api.js';

/**
 * One course's announcements, newest first as the server returns them.
 *
 * <p>The studio reads one course at a time; a learner now has the cross-course
 * feed below instead of merging several of these by hand.</p>
 */
export async function fetchAnnouncements(courseId) {
  const { data } = await api.get(`/courses/${courseId}/announcements`);
  return data;
}

/**
 * Every notice the signed-in learner can see, one page at a time.
 *
 * <p>The server already applied enrollment, publish state and the class boundary,
 * so this only decides how much to render. `unread` narrows the list without
 * changing the unread total, which stays the whole feed's number.</p>
 */
export async function fetchAnnouncementFeed({ page = 0, size = 20, courseId = null, unread = false } = {}) {
  const params = { page, size };
  if (courseId) params.courseId = courseId;
  if (unread) params.unread = true;
  const { data } = await api.get('/announcements', { params });
  return data;
}

/** The number behind the nav badge, without downloading a page of notes. */
export async function fetchUnreadAnnouncementCount() {
  const { data } = await api.get('/announcements/unread-count');
  return data.unread;
}

/**
 * Records that the signed-in learner has read one note.
 *
 * <p>The server answers `204` and keeps the first read time, so calling it twice
 * is harmless. The caller owns the failure: the page reports it and leaves the
 * note unread rather than pretending it worked.</p>
 */
export async function markAnnouncementRead(announcementId) {
  await api.post(`/announcements/${announcementId}/read`);
}

/** Marks everything the learner's feed would show, and returns how many changed. */
export async function markAllAnnouncementsRead() {
  const { data } = await api.post('/announcements/read-all');
  return data.marked;
}

/** One `{ announcementId, recipients, read, readPercent }` per note in a course. */
export async function fetchAnnouncementReceipts(courseId) {
  const { data } = await api.get(`/courses/${courseId}/announcements/receipts`);
  return data;
}

/**
 * Who has or has not read one note. The counts cover the whole audience; only the
 * rows are paged, so expanding the list never changes the percentage above it.
 */
export async function fetchAnnouncementReceiptDetail(
  announcementId,
  { status = 'unread', page = 0, size = 50 } = {},
) {
  const { data } = await api.get(`/announcements/${announcementId}/receipts`, {
    params: { status, page, size },
  });
  return data;
}
