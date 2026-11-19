import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchUnreadAnnouncementCount } from '../services/announcements.js';

const AnnouncementsContext = createContext(null);

/** A focus refresh younger than this would be the same answer asked twice. */
const FOCUS_REFRESH_MS = 60_000;

/**
 * The unread notice count, shared by the nav badge and the notices page.
 *
 * <p>One request when a learner signs in, one more when they return to the tab
 * after a minute away, and a local update whenever the page changes read state.
 * A failure leaves the last number in place: a badge is not worth an error panel.</p>
 */
export function AnnouncementsProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const lastFetchedAt = useRef(0);
  const isLearner = user?.role === 'STUDENT';

  const refresh = useCallback(async () => {
    if (!isLearner) {
      setUnread(0);
      return 0;
    }
    try {
      const count = await fetchUnreadAnnouncementCount();
      setUnread(count);
      lastFetchedAt.current = Date.now();
      return count;
    } catch {
      return null;
    }
  }, [isLearner]);

  useEffect(() => {
    if (!isLearner) {
      setUnread(0);
      lastFetchedAt.current = 0;
      return;
    }
    refresh();
  }, [isLearner, refresh]);

  useEffect(() => {
    if (!isLearner) return undefined;
    const onFocus = () => {
      if (Date.now() - lastFetchedAt.current > FOCUS_REFRESH_MS) refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isLearner, refresh]);

  /** Applies a count the caller already knows, without a round trip. */
  const setUnreadCount = useCallback((next) => {
    setUnread(Math.max(0, next));
    lastFetchedAt.current = Date.now();
  }, []);

  const value = useMemo(
    () => ({ unread, refresh, setUnreadCount }),
    [unread, refresh, setUnreadCount],
  );

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>;
}

export function useAnnouncements() {
  const context = useContext(AnnouncementsContext);
  if (!context) {
    throw new Error('useAnnouncements must be used inside <AnnouncementsProvider>');
  }
  return context;
}
