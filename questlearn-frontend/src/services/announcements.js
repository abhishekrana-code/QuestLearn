import api from './api.js';

/**
 * One course's announcements, newest first as the server returns them.
 *
 * <p>The card merges several courses and the studio reads one, so the request
 * lives here instead of being written twice. Neither caller needs to know the
 * URL, and the error policy stays with the caller: the card swallows a failure,
 * the studio shows it.</p>
 */
export async function fetchAnnouncements(courseId) {
  const { data } = await api.get(`/courses/${courseId}/announcements`);
  return data;
}

/**
 * Every note from the given courses, tagged with its course and newest first.
 *
 * <p>Announcements are supplementary, so one course that fails to answer drops
 * out instead of emptying the whole list. The caller only has to handle its own
 * request failing.</p>
 */
export async function fetchAnnouncementsFor(courses) {
  const groups = await Promise.all(
    courses.map((course) =>
      fetchAnnouncements(course.id)
        .then((announcements) =>
          announcements.map((announcement) => ({
            ...announcement,
            courseTitle: course.title,
            courseEmoji: course.emoji,
          })),
        )
        .catch(() => []),
    ),
  );
  return groups
    .flat()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}
