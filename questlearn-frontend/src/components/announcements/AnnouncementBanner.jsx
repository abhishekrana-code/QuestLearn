import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Megaphone } from 'lucide-react';
import { fetchAnnouncementsFor } from '../../services/announcements.js';
import { postedAt } from '../../utils/dates.js';

/**
 * The newest note across the learner's courses, as the way into the notices page.
 *
 * <p>It is a banner rather than a card because it is one line of news with one
 * action: read the rest. A failed fetch or an empty list hides it entirely, so a
 * quiet course leaves the dashboard unchanged.</p>
 */
export default function AnnouncementBanner({ courses = [], className = '' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // The dashboard rebuilds its course array on every render, so ids are the
  // stable identity to fetch against.
  const courseKey = courses.map((course) => course.id).join(',');

  useEffect(() => {
    if (!courseKey) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    fetchAnnouncementsFor(courses)
      .then((next) => {
        if (cancelled) return;
        setItems(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseKey]);

  // Newest first, so the first item is the latest.
  const [latest] = items;
  const total = items.length;

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
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-text">
          Latest notice · {latest.courseEmoji || '🗺️'} {latest.courseTitle}
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
