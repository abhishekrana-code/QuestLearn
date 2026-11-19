import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Megaphone } from 'lucide-react';
import { fetchAnnouncementFeed } from '../../services/announcements.js';
import { postedAt } from '../../utils/dates.js';

/**
 * The newest note across the learner's courses, as the way into the notices page.
 *
 * <p>It is a banner rather than a card because it is one line of news with one
 * action: read the rest. One request (the first page of the feed, size one) brings
 * the note, the unread count and the total with it, so a dashboard with six
 * courses still costs one call. A failed fetch or an empty feed hides it entirely,
 * so a quiet course leaves the dashboard unchanged.</p>
 */
export default function AnnouncementBanner({ className = '' }) {
  const [latest, setLatest] = useState(null);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAnnouncementFeed({ page: 0, size: 1 })
      .then((feed) => {
        if (cancelled) return;
        setLatest(feed.announcements[0] ?? null);
        setUnread(feed.unreadCount);
        setTotal(feed.total);
      })
      .catch(() => {
        if (!cancelled) setLatest(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !latest) {
    return null;
  }

  return (
    <Link
      to="/announcements"
      className={`panel card-hover flex items-center gap-3.5 border-gold/30 bg-brand-tint/60 p-4 sm:p-5 ${className}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/[0.14] text-gold-text">
        <Megaphone size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-text">
          <span>
            Latest notice · {latest.courseEmoji || '🗺️'} {latest.courseTitle}
          </span>
          {unread > 0 && (
            <span className="rounded-full bg-gold/[0.18] px-1.5 py-0.5 text-[9px] tracking-[0.1em]">
              {unread} unread
            </span>
          )}
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-foreground">{latest.body}</p>
        <p className="mt-1 text-[10px] text-fg-subtle">
          {latest.cohortName ? `${latest.cohortName} · ` : ''}
          {latest.authorName || 'Your instructor'} · {postedAt(latest.createdAt, { sameDayTime: true })}
        </p>
      </div>

      <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold text-gold-text sm:inline-flex">
        {total > 1 ? `All ${total} notices` : 'All notices'}
        <ArrowRight size={12} />
      </span>
    </Link>
  );
}
