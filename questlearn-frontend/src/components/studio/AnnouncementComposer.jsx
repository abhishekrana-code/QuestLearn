import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Megaphone, Send, Trash2, Users } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import api, { apiError } from '../../services/api.js';
import {
  fetchAnnouncementReceiptDetail,
  fetchAnnouncementReceipts,
  fetchAnnouncements,
} from '../../services/announcements.js';
import { postedAt } from '../../utils/dates.js';

const MAX_BODY = 2000;
/** The server clamps receipt pages at 50, so asking for more would be a lie. */
const RECEIPT_PAGE = 50;

/**
 * Compose a note for the whole course or one of its classes.
 *
 * <p>The class list comes from the same endpoint the classes page uses, so a new
 * class is addressable immediately. Posting is deliberately plain: no scheduling
 * and no email, because a note that arrives is the whole feature.</p>
 *
 * <p>Each note carries its read count, which is what makes posting worth doing:
 * the teacher can see whether the room got the message. The audience rows are
 * fetched on expand, so a course with a year of notes still loads in one pass.</p>
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
  // announcementId -> { recipients, read, readPercent }
  const [receipts, setReceipts] = useState({});
  // The note whose "who has not read it" list is open, and the fetched rows.
  const [openReceipt, setOpenReceipt] = useState(null);
  const [receiptDetails, setReceiptDetails] = useState({});
  // Per note, so a failure stays beside the row it belongs to.
  const [receiptErrors, setReceiptErrors] = useState({});
  const [loadingReceipt, setLoadingReceipt] = useState(null);
  const [loadingMore, setLoadingMore] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classResponse, announcements, summaries] = await Promise.all([
        api.get(`/courses/${course.id}/cohorts`).catch(() => ({ data: [] })),
        fetchAnnouncements(course.id),
        // Receipts are a convenience on top of the list: a failure hides the
        // counts instead of replacing the announcements with an error.
        fetchAnnouncementReceipts(course.id).catch(() => []),
      ]);
      setCohorts(classResponse.data);
      setItems(announcements);
      setReceipts(
        Object.fromEntries(summaries.map((summary) => [summary.announcementId, summary])),
      );
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
      setReceipts((previous) => {
        const next = { ...previous };
        delete next[pendingDelete.id];
        return next;
      });
      if (openReceipt === pendingDelete.id) setOpenReceipt(null);
      setPendingDelete(null);
      setNotice({ tone: 'success', text: 'Announcement removed.' });
    } catch (deleteFailure) {
      setDeleteError(apiError(deleteFailure, 'Could not remove the announcement.'));
    } finally {
      setDeleting(false);
    }
  };

  /** Drops one note's message so a retry that succeeds does not leave it behind. */
  const clearReceiptError = (announcementId) => {
    setReceiptErrors((previous) => {
      if (!previous[announcementId]) return previous;
      const next = { ...previous };
      delete next[announcementId];
      return next;
    });
  };

  const toggleReceipts = async (announcementId) => {
    if (openReceipt === announcementId) {
      setOpenReceipt(null);
      return;
    }
    setOpenReceipt(announcementId);
    if (receiptDetails[announcementId] || loadingReceipt === announcementId) return;
    setLoadingReceipt(announcementId);
    try {
      const detail = await fetchAnnouncementReceiptDetail(announcementId, {
        status: 'unread',
        size: RECEIPT_PAGE,
      });
      setReceiptDetails((previous) => ({ ...previous, [announcementId]: detail }));
      clearReceiptError(announcementId);
    } catch (receiptFailure) {
      setReceiptErrors((previous) => ({
        ...previous,
        [announcementId]: apiError(receiptFailure, 'Could not load who has not read this note.'),
      }));
    } finally {
      setLoadingReceipt(null);
    }
  };

  /**
   * Appends the next page of unread names. The counts and percentage come from the
   * course summaries, so paging the rows never moves them.
   */
  const loadMoreReceipts = async (announcementId) => {
    const detail = receiptDetails[announcementId];
    if (loadingMore === announcementId || detail.page + 1 >= detail.totalPages) return;
    setLoadingMore(announcementId);
    try {
      const next = await fetchAnnouncementReceiptDetail(announcementId, {
        status: 'unread',
        page: detail.page + 1,
        size: detail.size,
      });
      setReceiptDetails((previous) => ({
        ...previous,
        [announcementId]: { ...next, rows: [...previous[announcementId].rows, ...next.rows] },
      }));
      clearReceiptError(announcementId);
    } catch (receiptFailure) {
      setReceiptErrors((previous) => ({
        ...previous,
        [announcementId]: apiError(receiptFailure, 'Could not load the rest of this list.'),
      }));
    } finally {
      setLoadingMore(null);
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
            {items.map((announcement) => {
              const receipt = receipts[announcement.id];
              const detail = receiptDetails[announcement.id];
              // The panel only asks for unread rows, so this is the audience minus
              // its readers; the server never reports more readers than recipients.
              const unreadTotal = detail ? detail.recipients - detail.read : 0;
              const hiddenNames = detail ? unreadTotal - detail.rows.length : 0;
              return (
                <li
                  key={announcement.id}
                  className="rounded-xl border border-line bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
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
                      {receipt ? (
                        receipt.recipients === 0 ? (
                          <p className="mt-1.5 text-[10px] text-fg-subtle">
                            {announcement.cohortId
                              ? `Nobody has joined ${announcement.cohortName || 'this class'} yet.`
                              : 'Nobody has enrolled on this course yet.'}
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleReceipts(announcement.id)}
                            aria-expanded={openReceipt === announcement.id}
                            className="-mx-1 mt-1 inline-flex min-h-[32px] items-center gap-1 rounded-lg px-1 text-[10px] font-semibold text-fg-muted transition-colors hover:bg-muted/60 hover:text-gold-text"
                          >
                            <Users size={11} />
                            {receipt.read} of {receipt.recipients} read · {receipt.readPercent}%
                            <span className="sr-only">, posted {postedAt(announcement.createdAt)}</span>
                            <ChevronDown
                              size={12}
                              aria-hidden="true"
                              className={`transition-transform duration-150 ${
                                openReceipt === announcement.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        )
                      ) : null}
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
                  </div>

                  {openReceipt === announcement.id && receipt ? (
                    <div className="mt-2 border-t border-line pt-2">
                      {loadingReceipt === announcement.id ? (
                        <p className="text-[10.5px] text-fg-subtle">Loading the audience…</p>
                      ) : detail ? (
                        detail.rows.length > 0 ? (
                          <>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                              Not read yet
                            </p>
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                              {detail.rows.map((row) => (
                                <li
                                  key={row.userId}
                                  className="chip max-w-full whitespace-normal break-words leading-4 text-fg-muted"
                                >
                                  {row.name}
                                </li>
                              ))}
                            </ul>
                            {hiddenNames > 0 && (
                              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
                                <span>
                                  {detail.rows.length} of {unreadTotal} shown
                                </span>
                                <button
                                  type="button"
                                  onClick={() => loadMoreReceipts(announcement.id)}
                                  disabled={loadingMore === announcement.id}
                                  className="min-h-[28px] rounded-lg px-1.5 font-semibold text-gold-text transition-colors hover:bg-muted/60 disabled:opacity-60"
                                >
                                  {loadingMore === announcement.id ? 'Loading…' : 'Load more names'}
                                </button>
                              </p>
                            )}
                            {receiptErrors[announcement.id] && (
                              <p role="alert" className="mt-1 text-[10.5px] leading-4 text-danger">
                                {receiptErrors[announcement.id]}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[10.5px] text-success">
                            Everyone it was sent to has read it.
                          </p>
                        )
                      ) : (
                        <p role="alert" className="text-[10.5px] leading-4 text-danger">
                          {receiptErrors[announcement.id] || 'Could not load this list.'}
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
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
