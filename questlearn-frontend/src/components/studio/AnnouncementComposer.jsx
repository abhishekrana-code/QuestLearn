import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, Send, Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import api, { apiError } from '../../services/api.js';
import { fetchAnnouncements } from '../../services/announcements.js';
import { postedAt } from '../../utils/dates.js';

const MAX_BODY = 2000;

/**
 * Compose a note for the whole course or one of its classes.
 *
 * <p>The class list comes from the same endpoint the classes page uses, so a new
 * class is addressable immediately. Posting is deliberately plain: no scheduling
 * and no email, because a note that arrives is the whole feature.</p>
 */
export default function AnnouncementComposer({ course }) {
  const [body, setBody] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [cohorts, setCohorts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // One message at a time: a post result replaces a stale load error instead of
  // stacking a green sentence under a red one.
  const [notice, setNotice] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classResponse, announcements] = await Promise.all([
        api.get(`/courses/${course.id}/cohorts`).catch(() => ({ data: [] })),
        fetchAnnouncements(course.id),
      ]);
      setCohorts(classResponse.data);
      setItems(announcements);
    } catch (loadError) {
      setNotice({ tone: 'error', text: apiError(loadError, 'Could not load this course’s announcements.') });
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (event) => {
    event.preventDefault();
    if (busy) return;
    const cleaned = body.trim();
    if (!cleaned) {
      setNotice({ tone: 'error', text: 'Write the announcement before posting it.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await api.post(`/courses/${course.id}/announcements`, {
        body: cleaned,
        cohortId: cohortId ? Number(cohortId) : null,
      });
      setItems((previous) => [data, ...previous]);
      setBody('');
      setNotice({
        tone: 'success',
        text: data.cohortName
          ? `Posted to ${data.cohortName}.`
          : 'Posted to everyone enrolled in this course.',
      });
    } catch (postError) {
      setNotice({ tone: 'error', text: apiError(postError, 'Could not post the announcement.') });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/announcements/${pendingDelete.id}`);
      setItems((previous) => previous.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setNotice({ tone: 'success', text: 'Announcement removed.' });
    } catch (deleteFailure) {
      setDeleteError(apiError(deleteFailure, 'Could not remove the announcement.'));
    } finally {
      setDeleting(false);
    }
  };

  const remaining = MAX_BODY - body.length;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Megaphone size={15} className="text-gold-text" /> Announcements
        </h2>
        <span className="chip border-line text-fg-muted">whole course or one class</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
        A note appears on the dashboard of everyone it is addressed to. It does not send email.
      </p>

      <form onSubmit={post} className="mt-3 space-y-2">
        <label htmlFor="announcement-body" className="sr-only">
          Announcement text
        </label>
        <textarea
          id="announcement-body"
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
          rows={3}
          placeholder="The lab moved to Thursday. Bring your notebooks."
          className="field min-h-[84px] w-full resize-y py-2.5 text-xs leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="announcement-audience" className="text-[11px] font-medium text-fg-muted">
            Send to
          </label>
          <select
            id="announcement-audience"
            value={cohortId}
            onChange={(event) => setCohortId(event.target.value)}
            className="field w-auto py-0 pr-8 text-xs"
          >
            <option value="">Everyone enrolled</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[10px] tabular-nums text-fg-subtle">
            {remaining} characters left
          </span>
          <button type="submit" disabled={busy || !body.trim()} className="btn-primary text-xs">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-[11px] leading-5 ${
            notice.tone === 'error' ? 'text-danger' : 'text-success'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        {loading ? (
          <p className="text-[11px] text-fg-subtle">Loading announcements…</p>
        ) : items.length === 0 ? (
          <p className="text-[11px] text-fg-subtle">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((announcement) => (
              <li
                key={announcement.id}
                className="flex items-start gap-2 rounded-xl border border-line bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[10px] text-fg-subtle">
                    <span className="font-semibold uppercase tracking-[0.1em]">
                      {announcement.cohortName || 'Everyone enrolled'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{postedAt(announcement.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[12px] leading-5 text-foreground">
                    {announcement.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError('');
                    setPendingDelete(announcement);
                  }}
                  aria-label={`Delete the announcement posted ${postedAt(announcement.createdAt)}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-muted/40 text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this announcement?"
          message={`This removes it from every dashboard it was posted to. "${pendingDelete.body.slice(0, 80)}${
            pendingDelete.body.length > 80 ? '…' : ''
          }"`}
          confirmLabel="Delete"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => !deleting && setPendingDelete(null)}
        />
      )}
    </div>
  );
}
