import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Megaphone } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { fetchAnnouncementsFor, markAnnouncementRead } from '../services/announcements.js';
import { postedAt } from '../utils/dates.js';

/**
 * Every notice a learner has been sent, newest first.
 *
 * <p>The server already limits the list to enrolled courses and to the classes
 * the learner belongs to, so this page only merges and renders. Course titles
 * come from the course list because an announcement row only carries ids.</p>
 *
 * <p>Unread is per note and per learner: a note is marked read on this page, not
 * by opening it, so the list can still show what was waiting when it arrived.</p>
 */
export default function Announcements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A failed mark leaves the list intact, so it is reported beside the notes
  // instead of replacing them with an error panel.
  const [markError, setMarkError] = useState('');
  const [markingId, setMarkingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/courses');
      const courses = data.filter((course) => course.enrolled);
      setItems(courses.length > 0 ? await fetchAnnouncementsFor(courses) : []);
    } catch (loadError) {
      setError(apiError(loadError, 'Could not load your notices.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id) {
    setMarkingId(id);
    setMarkError('');
    try {
      await markAnnouncementRead(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
    } catch (markFailure) {
      setMarkError(apiError(markFailure, 'Could not mark that notice as read.'));
    } finally {
      setMarkingId(null);
    }
  }

  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-8">
        <p className="eyebrow">Notices</p>
        <h1 className="page-title mt-3">Notices and announcements</h1>
        <p className="page-subtitle mt-2">
          Everything your instructors posted to your courses and classes, newest first.
        </p>
      </header>

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
          <p className="mt-3 text-sm font-semibold text-foreground">No notices yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-fg-muted">
            When an instructor posts to one of your courses or classes, it appears here and in the
            banner on your dashboard.
          </p>
          <Link to="/explore" className="btn-primary mt-4 h-9 text-[12px]">
            Browse courses
          </Link>
        </div>
      ) : (
        <>
          {markError ? (
            <p role="alert" className="mb-3 text-[12px] leading-5 text-danger">
              {markError}
            </p>
          ) : null}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              {items.length} {items.length === 1 ? 'notice' : 'notices'}
            </p>
            {unread > 0 ? (
              <span className="rounded-full border border-gold/30 bg-gold/[0.12] px-2 py-0.5 text-[10px] font-semibold text-gold-text">
                {unread} unread
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                All caught up
              </span>
            )}
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
        </>
      )}
    </div>
  );
}
