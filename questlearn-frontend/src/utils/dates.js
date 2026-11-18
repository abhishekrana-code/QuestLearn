/**
 * A short day and month, e.g. "3 Nov", for deadlines and attempt times.
 *
 * <p>The same three-line formatter was copied into the roster, the learner detail
 * page and the performance page, and written a fourth time inline. Accepts a Date
 * or anything the Date constructor understands, and returns "Not set" for an empty
 * value, which is what the roster needs for a node without a deadline.</p>
 */
export function shortDate(value) {
  if (!value) return 'Not set';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * When a note was posted, e.g. "Nov 12, 2:05 PM".
 *
 * <p>The banner and the two lists show the same stamp, so the format lives here.
 * The banner alone passes <code>sameDayTime</code>, since a note posted an hour
 * ago reads better as a time than as a date: a bare time today, a day and month
 * before that.</p>
 */
export function postedAt(value, { sameDayTime = false } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (!sameDayTime) {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
