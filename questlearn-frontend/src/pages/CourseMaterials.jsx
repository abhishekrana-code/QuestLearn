import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Loader2,
  Quote,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import LoadErrorBanner from '../components/common/LoadErrorBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../services/api.js';

const STATUS = {
  UPLOADED: {
    label: 'Queued',
    chip: 'border-line text-fg-muted',
    busy: true,
  },
  PROCESSING: {
    label: 'Processing',
    chip: 'border-gold/30 bg-gold/[0.08] text-gold-text',
    busy: true,
  },
  READY: {
    label: 'Ready',
    chip: 'border-success/30 bg-success/[0.08] text-success',
    busy: false,
  },
  FAILED: {
    label: 'Failed',
    chip: 'border-danger/30 bg-danger/[0.07] text-danger',
    busy: false,
  },
};

function sizeLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Course readings and the questions asked about them.
 *
 * <p>Instructors upload PDFs; learners ask a question and see the answer beside
 * the page it came from. The PDF never lives in this app: VerityAI processes it
 * and returns page-level citations, and this page only presents them.</p>
 */
export default function CourseMaterials() {
  const { courseId } = useParams();
  const { user } = useAuth();

  const [materials, setMaterials] = useState([]);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const fileInput = useRef(null);

  // The server lets only the owning instructor or an admin add and remove
  // readings, so the page follows the same rule. The course DTO carries the
  // owner, which is why this page reads it once.
  const ownsCourse =
    user?.role === 'INSTRUCTOR' &&
    course?.instructorId != null &&
    Number(course.instructorId) === Number(user?.id);
  const canManage = user?.role === 'ADMIN' || ownsCourse;

  const load = useCallback(
    async (refresh = true) => {
      const { data } = await api.get(
        `/courses/${courseId}/materials${refresh ? '?refresh=true' : ''}`,
      );
      setMaterials(Array.isArray(data) ? data : []);
      return data;
    },
    [courseId],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/courses/${courseId}`)
      .then(({ data }) => {
        if (!cancelled) setCourse(data ?? null);
      })
      .catch(() => {
        // Without the course the controls stay hidden, which is the safe default.
        if (!cancelled) setCourse(null);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .catch((loadError) => {
        if (!cancelled) setError(apiError(loadError, 'Could not load this course’s materials.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // While a file is still being processed, ask the server for its current
  // state every few seconds. The server only calls VerityAI for unfinished
  // rows, so a settled course costs nothing.
  useEffect(() => {
    const pending = materials.some((material) => STATUS[material.status]?.busy);
    if (!pending) return undefined;
    const timer = setInterval(() => {
      load(true).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [materials, load]);

  const ready = materials.filter((material) => material.status === 'READY');

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setActionError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/courses/${courseId}/materials`, form);
      await load(true);
    } catch (uploadError) {
      setActionError(apiError(uploadError, 'Could not upload that PDF.'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (material) => {
    const confirmed = window.confirm(
      `Remove “${material.filename}” from this course? Learners will no longer be able to ask about it.`,
    );
    if (!confirmed) return;
    setActionError(null);
    setDeletingId(material.id);
    try {
      await api.delete(`/courses/${courseId}/materials/${material.id}`);
      setAnswer(null);
      await load(true);
    } catch (deleteError) {
      setActionError(apiError(deleteError, 'Could not remove that material.'));
    } finally {
      setDeletingId(null);
    }
  };

  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3) return;
    setActionError(null);
    setAsking(true);
    try {
      const { data } = await api.post(`/courses/${courseId}/materials/ask`, {
        question: text,
      });
      setAnswer(data);
      setQuestion('');
    } catch (askError) {
      setActionError(apiError(askError, 'Could not answer that question.'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-6">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} /> Back to course
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-card text-2xl shadow-card">
              <BookOpen size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="page-title">Course materials</h1>
              <p className="page-subtitle mt-1.5 max-w-2xl">
                Upload the readings for this course, then ask a question and see the page each
                part of the answer came from.
              </p>
            </div>
          </div>
          <span className="chip border-transparent bg-brand-tint text-gold-text">
            <Sparkles size={12} /> {ready.length} ready
          </span>
        </div>
      </header>

      <LoadErrorBanner
        className="mb-4"
        message={error}
        paused
        onRetry={() => {
          setError(null);
          setLoading(true);
          load()
            .catch((loadError) =>
              setError(apiError(loadError, 'Could not load this course’s materials.')),
            )
            .finally(() => setLoading(false));
        }}
      />

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger"
        >
          {actionError}
        </div>
      )}

      {canManage && (
        <section className="card mb-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Add a reading
              </h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                PDF only, up to 25 MB. Processing usually takes a few moments; the status below
                updates by itself.
              </p>
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                onChange={upload}
                className="sr-only"
                id="course-material-file"
                disabled={uploading}
              />
              <label
                htmlFor="course-material-file"
                className={`btn btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploading ? 'Uploading…' : 'Choose a PDF'}
              </label>
            </div>
          </div>
        </section>
      )}

      <section className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Readings</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            {materials.length} {materials.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
            <Loader2 size={16} className="animate-spin" /> Loading materials…
          </div>
        ) : materials.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <FileText size={26} className="mx-auto text-fg-subtle" />
            <p className="mt-3 text-sm font-medium text-foreground">No materials yet</p>
            <p className="mt-1 text-sm text-fg-muted">
              {canManage
                ? 'Upload a PDF to give this course a searchable reading.'
                : 'Your instructor has not added a reading to this course yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {materials.map((material) => {
              const meta = STATUS[material.status] ?? STATUS.UPLOADED;
              return (
                <li
                  key={material.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-muted text-fg-muted">
                    <FileText size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {material.filename}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {[sizeLabel(material.sizeBytes), shortDate(material.createdAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {material.status === 'FAILED' && material.errorMessage && (
                      <p className="mt-1 text-[11px] text-danger">{material.errorMessage}</p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${meta.chip}`}
                  >
                    {meta.busy && <Loader2 size={11} className="animate-spin" />}
                    {meta.label}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => remove(material)}
                      disabled={deletingId === material.id}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-line text-fg-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                      aria-label={`Remove ${material.filename}`}
                    >
                      {deletingId === material.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-brand-tint text-gold-text">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Ask the readings
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Answers are grounded in this course’s PDFs. Every claim that comes from a page is
              cited below the answer.
            </p>
          </div>
        </div>

        <form onSubmit={ask} className="mt-4">
          <label htmlFor="material-question" className="label">
            Your question
          </label>
          <textarea
            id="material-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder={
              ready.length
                ? 'What does the reading say about…?'
                : 'A reading must finish processing before you can ask about it.'
            }
            className="field mt-1.5 min-h-[92px] resize-y"
            disabled={asking || ready.length === 0}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-fg-subtle">
              {ready.length
                ? `Searching ${ready.length} ready ${ready.length === 1 ? 'reading' : 'readings'}.`
                : 'No processed reading is available yet.'}
            </p>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={asking || ready.length === 0 || question.trim().length < 3}
            >
              {asking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {asking ? 'Reading…' : 'Ask'}
            </button>
          </div>
        </form>

        {answer && (
          <article className="mt-6 rounded-2xl border border-line bg-muted/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-foreground">Answer</h3>
              {answer.evidenceStatus && (
                <span
                  className={`chip ${
                    answer.evidenceStatus === 'SUFFICIENT'
                      ? 'border-success/30 bg-success/[0.08] text-success'
                      : 'border-gold/30 bg-gold/[0.08] text-gold-text'
                  }`}
                >
                  {answer.evidenceStatus === 'SUFFICIENT'
                    ? 'Grounded in the readings'
                    : answer.evidenceStatus === 'INSUFFICIENT'
                      ? 'Answered without a citation'
                      : 'No matching passage'}
                </span>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {answer.answer}
            </p>

            {(answer.citations ?? []).length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                  Sources
                </p>
                <ul className="mt-2 space-y-2">
                  {answer.citations.map((citation, index) => (
                    <li
                      key={`${citation.documentName}-${citation.pageNumber}-${index}`}
                      className="rounded-xl border border-line bg-card px-3.5 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-fg-muted">
                        <Quote size={12} className="text-gold-text" />
                        <span className="text-foreground">
                          {citation.documentName || 'Course reading'}
                        </span>
                        {citation.pageNumber && (
                          <span className="chip border-line text-fg-muted">
                            page {citation.pageNumber}
                          </span>
                        )}
                      </div>
                      {citation.excerpt && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
                          “{citation.excerpt}”
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
