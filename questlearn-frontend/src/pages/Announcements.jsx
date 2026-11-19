import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, Megaphone } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import {
  fetchAnnouncementFeed,
  markAllAnnouncementsRead,
  markAnnouncementRead,
} from '../services/announcements.js';
import { postedAt } from '../utils/dates.js';
import { useAnnouncements } from '../context/AnnouncementsContext.jsx';

const PAGE_SIZE = 20;

/**
 * Every notice a learner has been sent, newest first.
 *
 * <p>One request for the page instead of one per enrolled course: the server
 * already limited the list to live courses and to the classes the learner belongs
 * to, and it now carries the course title and emoji each row is labelled with.</p>
 *
 * <p>Unread is per note and per learner: a note is marked read on this page, not
 * by opening it, so the list can still show what was waiting when it arrived. The
 * nav badge is updated from the same numbers, without asking the server again.</p>
 *
 * <p>The unread and course filters are applied by the server, which pages the
 * narrowed list and reports its total. The unread count above them always covers
 * the whole feed, so the pill and the nav badge keep matching each other.</p>
 */
export default function Announcements() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ unreadCount: 0, total: 0, page: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // A failed mark leaves the list intact, so it is reported beside the notes
  // instead of replacing them with an error panel.
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [markingId, setMarkingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  // Changing a filter supersedes whatever is in flight, so an older page cannot
  // land under a newer filter.
  const feedRequest = useRef(0);
  const { setUnreadCount } = useAnnouncements();

  useEffect(() => {
    // The picker is supplementary: without it the notices themselves still load.
    api
      .get('/courses/mine')
      .then(({ data }) => setCourses(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const request = ++feedRequest.current;
    setLoading(true);
    setLoadingMore(false);
    setActionError('');
    setError('');
    try {
      const first = await fetchAnnouncementFeed({
        page: 0,
        size: PAGE_SIZE,
        courseId: courseId ? Number(courseId) : null,
        unread: unreadOnly,
      });
      if (request !== feedRequest.current) return;
      setItems(first.announcements);
      setMeta(first);
      setUnreadCount(first.unreadCount);
    } catch (loadError) {
      if (request === feedRequest.current) {
        setError(apiError(loadError, 'Could not load your notices.'));
      }
    } finally {
      if (request === feedRequest.current) setLoading(false);
    }
  }, [courseId, unreadOnly, setUnreadCount]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || meta.page + 1 >= meta.totalPages) return;
    const request = feedRequest.current;
    setLoadingMore(true);
    setActionError('');
    try {
      const next = await fetchAnnouncementFeed({
        page: meta.page + 1,
        size: PAGE_SIZE,
        courseId: courseId ? Number(courseId) : null,
        unread: unreadOnly,
      });
      if (request !== feedRequest.current) return;
      setItems((current) => [...current, ...next.announcements]);
      setMeta(next);
    } catch (moreError) {
      if (request === feedRequest.current) {
        setActionError(apiError(moreError, 'Could not load more notices.'));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(id) {
    setMarkingId(id);
    setActionError('');
    setStatus('');
    try {
      await markAnnouncementRead(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      const nextUnread = Math.max(0, meta.unreadCount - 1);
      setMeta((current) => ({ ...current, unreadCount: nextUnread }));
      setUnreadCount(nextUnread);
    } catch (markFailure) {
      setActionError(apiError(markFailure, 'Could not mark that notice as read.'));
    } finally {
      setMarkingId(null);
    }
  }

  async function markAll() {
    if (markingAll) return;
    setMarkingAll(true);
    setActionError('');
    setStatus('');
    try {
      const marked = await markAllAnnouncementsRead();
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setMeta((current) => ({ ...current, unreadCount: 0 }));
      setUnreadCount(0);
      setStatus(
        marked > 0
          ? `${marked} notice${marked === 1 ? '' : 's'} marked read.`
          : 'Everything was already read.',
      );
    } catch (allFailure) {
      setActionError(apiError(allFailure, 'Could not mark your notices as read.'));
    } finally {
      setMarkingAll(false);
    }
  }

  function clearFilters() {
    setUnreadOnly(false);
    setCourseId('');
  }

  const unread = meta.unreadCount;
  const hasMore = meta.page + 1 < meta.totalPages;
  const filtersActive = unreadOnly || courseId !== '';
  const filteredEmptyMessage = !unreadOnly
    ? 'This course has nothing posted yet. Clear the filter to see your other notices.'
    : courseId
      ? 'Nothing here is unread. Clear a filter to see the rest of your notices.'
      : 'You have read every notice. Clear the unread filter to see older ones.';

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-8">
        <p className="eyebrow">Notices</p>
        <h1 className="page-title mt-3">Notices and announcements</h1>
        <p className="page-subtitle mt-2">
          Everything your instructors posted to your courses and classes, newest first.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-fg-muted">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-line"
          />
          Unread only
        </label>
        <label className="flex items-center gap-2 font-semibold">
          Course
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="field w-auto min-w-[9rem] text-[11px]"
            aria-label="Filter notices by course"
          >
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.emoji ? `${course.emoji} ` : ''}
                {course.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="panel p-6">
          <p role="alert" className="text-[12px] leading-5 text-danger">
            {error}
          </p>
          <button type="button" onClick={load} className="btn-ghost mt-3 h-9 text-xs">
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1].map((key) => (
            <div key={key} className="panel h-[104px] animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel p-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-gold-text">
            <Megaphone size={18} />
          </span>
          {filtersActive ? (
            <>
              <p className="mt-3 text-sm font-semibold text-foreground">
                No notices match these filters
              </p>
              <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-fg-muted">
                {filteredEmptyMessage}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="btn-primary mt-4 h-9 text-[12px]"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold text-foreground">No notices yet</p>
              <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-fg-muted">
                When an instructor posts to one of your courses or classes, it appears here and in
                the banner on your dashboard.
              </p>
              <Link to="/explore" className="btn-primary mt-4 h-9 text-[12px]">
                Browse courses
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {actionError ? (
            <p role="alert" className="mb-3 text-[12px] leading-5 text-danger">
              {actionError}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="mb-3 text-[11px] leading-5 text-success">
              {status}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              {meta.total} {meta.total === 1 ? 'notice' : 'notices'}
            </p>
            <div className="flex items-center gap-2">
              {unread > 0 ? (
                <span className="rounded-full border border-gold/30 bg-gold/[0.12] px-2 py-0.5 text-[10px] font-semibold text-gold-text">
                  {unread} unread
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  All caught up
                </span>
              )}
              {/* It marks the whole feed, so it is offered only while no course is
                  narrowing the list to a subset of that feed. */}
              {unread > 0 && !courseId && (
                <button
                  type="button"
                  onClick={markAll}
                  disabled={markingAll}
                  className="btn-ghost h-7 px-2 text-[10px]"
                >
                  <CheckCheck size={11} />
                  {markingAll ? 'Marking…' : 'Mark all read'}
                </button>
              )}
            </div>
          </div>

          <ul className="space-y-3">
            {items.map((announcement) => (
              <li
                key={announcement.id}
                className={`panel p-5 ${announcement.read ? '' : 'border-gold/30 bg-brand-tint/40'}`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-fg-subtle">
                  <span className="chip text-fg-muted">
                    {announcement.courseEmoji || '🗺️'} {announcement.courseTitle}
                  </span>
                  <span className="font-semibold uppercase tracking-[0.1em]">
                    {announcement.cohortName || 'Everyone enrolled'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{postedAt(announcement.createdAt)}</span>
                  {!announcement.read && (
                    <span className="rounded-full bg-gold/[0.16] px-1.5 py-0.5 font-semibold uppercase tracking-[0.1em] text-gold-text">
                      Unread
                    </span>
                  )}
                </div>
                <p className="mt-2.5 whitespace-pre-line text-[13px] leading-6 text-foreground">
                  {announcement.body}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-[11px] text-fg-subtle">
                    {announcement.authorName || 'Your instructor'}
                  </p>
                  {!announcement.read && (
                    <button
                      type="button"
                      onClick={() => markRead(announcement.id)}
                      disabled={markingId === announcement.id}
                      className="btn-ghost h-8 px-2.5 text-[11px]"
                    >
                      <Check size={12} />
                      {markingId === announcement.id ? 'Marking…' : 'Mark as read'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-ghost h-9 text-xs"
              >
                {loadingMore ? 'Loading…' : `Load ${meta.total - items.length} more`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
