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
