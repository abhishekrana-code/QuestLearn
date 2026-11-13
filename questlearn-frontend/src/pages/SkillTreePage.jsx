import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoRetry } from '../hooks/useAutoRetry.js';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Crown,
  ExternalLink,
  Film,
  Lock,
  Map,
  Mic,
  Play,
  Sparkles,
  X,
  History,
  RotateCcw,
} from 'lucide-react';
import FormattedText from '../components/common/FormattedText.jsx';
import QuizPlayer from '../components/quiz/QuizPlayer.jsx';
import SkillTreeCanvas from '../components/skilltree/SkillTreeCanvas.jsx';
import VoiceVivaDialog from '../components/viva/VoiceVivaDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGamification } from '../context/GamificationContext.jsx';
import api, { apiError } from '../services/api.js';
import { isPlayableVideo, getYouTubeEmbedUrl, getVimeoEmbedUrl } from '../services/media.js';

const STATUS_STYLE = {
  COMPLETED: 'border-success/30 bg-success/[0.06] text-success',
  UNLOCKED: 'border-gold/30 bg-brand-tint text-gold-text',
  LOCKED: 'border-line bg-muted text-fg-muted',
};

const STATUS_LABEL = {
  COMPLETED: 'Completed',
  UNLOCKED: 'Ready to play',
  LOCKED: 'Locked',
};

/** Net change across a node's tries, read from the newest-first API list. */
const historySummary = (history) => {
  if (!history || history.length < 2) return null;
  const firstTry = history[history.length - 1].score;
  const delta = history[0].score - firstTry;
  if (delta > 0) return `Up ${delta} points since the first try.`;
  if (delta < 0) return `Down ${Math.abs(delta)} points since the first try.`;
  return 'Same score as the first try so far.';
};

const ATTEMPT_LABEL = {
  VIVA_SPOKEN: 'Spoken viva',
  VIVA_WRITTEN: 'Typed viva',
  QUIZ: 'Quiz',
};

/** "just now", "12m ago", "3h ago", "2d ago", then the date. */
function timeAgo(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function SkillTreePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const { award } = useGamification();

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [vivaOpen, setVivaOpen] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [retakeKey, setRetakeKey] = useState(0);
  const quizRef = useRef(null);
  const briefingRef = useRef(null);

  const isPreview = user.role === 'INSTRUCTOR';

  const loadTree = useCallback(async () => {
    const { data } = await api.get(`/courses/${courseId}/skill-tree`);
    setTree(data);
    return data;
  }, [courseId]);

  const {
    paused: retryPaused,
    reset: resetAutoRetry,
    retryNow: retryLoadNow,
  } = useAutoRetry({
    active: Boolean(error) && !loading,
    retry: () => setLoadAttempt((previous) => previous + 1),
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // A retry must not leave the old failure on screen while it runs.
    setError(null);
    loadTree()
      .then(() => {
        if (!cancelled) resetAutoRetry();
      })
      .catch((loadError) => {
        if (!cancelled) setError(apiError(loadError, 'Could not load this skill tree.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTree, loadAttempt]);

  // On a phone the briefing sits below the map, so a tap would otherwise look like it
  // did nothing. Wait for the briefing content to render first: the map grows as it
  // lays out, and scrolling before that leaves the page at the top. From xl upward the
  // panel is already beside the map, so nothing moves.
  useEffect(() => {
    if (!selectedId || !window.matchMedia('(max-width: 1279px)').matches) return undefined;
    const timer = setTimeout(() => briefingRef.current?.scrollIntoView({ block: 'start' }), 80);
    return () => clearTimeout(timer);
  }, [selectedId, detail]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const openNode = async (node) => {
    setSelectedId(node.id);
    setDetail(null);
    setVivaOpen(false);
    setRetaking(false);
    setRetakeKey(0);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/modules/${node.id}`);
      setDetail(data);
    } catch (detailError) {
      setToast(apiError(detailError, 'Could not open that node.'));
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /**
   * Applies a graded viva: celebrate the XP, then refresh the tree and briefing.
   * The briefing is refreshed on failures too, so the node shows the attempt the
   * student just made before they retry.
   */
  const handleVivaGraded = async (result) => {
    if (result.passed) {
      award(result);
    }
    await loadTree().catch(() => {});
    try {
      const refreshed = await api.get(`/modules/${selectedId}`);
      setDetail(refreshed.data);
    } catch {
      /* the tree refresh is enough */
    }
    setToast(result.message);
  };

  const handleLockedClick = () => {
    setToast('This node is sealed. Clear its prerequisite to open the path.');
  };

  /**
   * Starts a fresh attempt from the history panel: the quiz resets in place, or
   * the arena opens for a viva node. Retakes are already allowed by the server;
   * this just opens the door the completed state had closed.
   */
  const startRetry = () => {
    // A node can carry a viva config without being a boss; the quiz is the
    // routine retry, and the arena has its own button below.
    if (detail?.quiz) {
      setRetaking(true);
      setRetakeKey((previous) => previous + 1);
      requestAnimationFrame(() => {
        quizRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    if (detail?.viva) setVivaOpen(true);
  };

  const completeModule = async (answers) => {
    const { data } = await api.post(`/modules/${selectedId}/complete`, { answers });
    // A retake pays no XP, so only a first clear celebrates.
    if (data.passed && data.xpGained > 0) {
      award(data);
    }
    // Refresh on failures too, so a retake appears in the history straight away.
    await loadTree().catch(() => {});
    try {
      const refreshed = await api.get(`/modules/${selectedId}`);
      setDetail(refreshed.data);
    } catch {
      /* the tree refresh is enough */
    }
    setToast(data.message);
    return data;
  };

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-[12px] text-fg-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold" />
          Unrolling the map…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell py-16">
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <p className="text-[13px] font-medium text-danger">{error}</p>
          <p className="mt-2 text-[11px] text-fg-muted">
            {retryPaused
              ? 'Automatic retries paused — use Try again when the server is back.'
              : 'Trying again automatically…'}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={retryLoadNow} className="btn-primary h-10 px-4 text-[12px]">
              <RotateCcw size={14} /> Try again
            </button>
            <Link to="/" className="btn-ghost h-10 px-4 text-[12px]">
              <ArrowLeft size={14} /> Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const percent =
    tree.totalModules > 0 ? Math.round((tree.completedModules / tree.totalModules) * 100) : 0;

  const nextNode = (tree.nodes ?? []).find((node) => node.status === 'UNLOCKED');

  return (
    <div className="shell py-8 sm:py-10">
      <header className="mb-6">
        <Link
          to={isPreview ? '/studio' : '/dashboard'}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} /> {isPreview ? 'Back to studio' : 'Dashboard'}
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-card text-2xl shadow-card">
              {tree.emoji || '🗺️'}
            </span>
            <div className="min-w-0">
              <h1 className="page-title">{tree.courseTitle}</h1>
              <p className="page-subtitle mt-1.5 max-w-2xl">{tree.courseDescription}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!isPreview && (
              <div className="text-right">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                  Nodes cleared
                </p>
                <p className="mt-1 font-display text-[20px] font-semibold tabular-nums leading-none tracking-[-0.04em] text-foreground">
                  {tree.completedModules}
                  <span className="text-[13px] text-fg-subtle"> / {tree.totalModules}</span>
                </p>
              </div>
            )}
            <span className="chip border-transparent bg-brand-tint text-gold-text">
              <Sparkles size={12} /> {tree.totalXp} XP
            </span>
          </div>
        </div>

        {!isPreview && (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-all duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-fg-muted">
              {percent}%
            </span>
          </div>
        )}

        {(tree.nodes ?? []).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Jump to node
            </span>
            {tree.nodes.map((node) => {
              const isSelected = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() =>
                    node.status === 'LOCKED' ? handleLockedClick(node) : openNode(node)
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition-colors duration-150 ${
                    isSelected
                      ? 'border-gold bg-brand-tint font-semibold text-gold-text ring-1 ring-gold/30'
                      : node.status === 'COMPLETED'
                        ? 'border-success/25 bg-success/[0.06] text-success hover:border-success/50'
                        : node.status === 'UNLOCKED'
                          ? 'border-gold/25 bg-brand-tint/60 text-gold-text hover:border-gold/50'
                          : 'border-line bg-muted/50 text-fg-subtle hover:border-line-strong'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      node.status === 'COMPLETED'
                        ? 'bg-success'
                        : node.status === 'UNLOCKED'
                          ? 'bg-gold'
                          : 'bg-line-strong'
                    }`}
                  />
                  <span className="max-w-[140px] truncate sm:max-w-[200px]">{node.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {isPreview && (
          <p className="mt-4 rounded-xl border border-arcane/25 bg-arcane/[0.06] px-3.5 py-2 text-[11px] leading-5 text-arcane-text">
            Instructor preview — you can play the quizzes, but XP and progress are only recorded for
            students.
          </p>
        )}
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <SkillTreeCanvas
          nodes={tree.nodes}
          activeId={selectedId}
          onSelect={openNode}
          onLockedClick={handleLockedClick}
        />

        <section
          ref={briefingRef}
          className="scroll-mt-24 xl:sticky xl:top-24 xl:h-[calc(100vh-7.5rem)]"
        >
          <div className="panel-raised flex h-full min-h-[340px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <BookOpen size={15} className="text-gold-text" /> Node briefing
              </h2>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close node"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {!selectedId && (
                <div className="flex min-h-full flex-col justify-center">
                  <div className="rounded-2xl border border-line bg-muted/40 p-5 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-tint text-gold-text">
                      <Map size={22} />
                    </span>
                    <p className="mt-3 text-[13px] font-semibold text-foreground">
                      Pick a node on the map
                    </p>
                    <p className="mt-1 text-[11.5px] leading-5 text-fg-muted">
                      A pulsing node is ready to play. Locked nodes need their prerequisite first.
                    </p>
                  </div>

                  <ul className="mt-4 space-y-2">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                        <CheckCircle2 size={12} />
                      </span>
                      <div>
                        <p className="text-[11.5px] font-semibold text-foreground">Completed</p>
                        <p className="text-[10.5px] leading-4 text-fg-subtle">
                          Cleared. Your best score stays on the node.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-tint text-gold-text">
                        <Play size={10} className="ml-0.5" />
                      </span>
                      <div>
                        <p className="text-[11.5px] font-semibold text-foreground">Ready to play</p>
                        <p className="text-[10.5px] leading-4 text-fg-subtle">
                          Open now. This is the next step in the path.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-fg-subtle">
                        <Lock size={10} />
                      </span>
                      <div>
                        <p className="text-[11.5px] font-semibold text-foreground">Locked</p>
                        <p className="text-[10.5px] leading-4 text-fg-subtle">
                          Finish the node above it to open the path.
                        </p>
                      </div>
                    </li>
                  </ul>

                  {!isPreview && nextNode && (
                    <button
                      type="button"
                      onClick={() => openNode(nextNode)}
                      className="btn-primary mt-5 h-10 w-full text-[12px]"
                    >
                      <Play size={13} />
                      Start with {nextNode.title}
                    </button>
                  )}
                </div>
              )}

              {detailLoading && (
                <div className="space-y-3">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-20 animate-pulse rounded-xl bg-muted/70" />
                  <div className="h-32 animate-pulse rounded-xl bg-muted/70" />
                </div>
              )}

              {detail && !detailLoading && (
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`chip ${STATUS_STYLE[detail.status]}`}>
                      {STATUS_LABEL[detail.status] ?? detail.status}
                    </span>
                    <span className="chip border-gold/25 text-gold-text">+{detail.xpReward} XP</span>
                    {detail.status === 'COMPLETED' && (
                      <span className="chip border-success/30 text-success">
                        {detail.score}% scored
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 font-display text-[19px] font-semibold leading-snug tracking-[-0.03em] text-foreground">
                    <FormattedText text={detail.title} />
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-6 text-fg-muted">
                    <FormattedText text={detail.summary} />
                  </p>

                  {detail.status === 'LOCKED' ? (
                    <div className="mt-5 rounded-xl border border-line bg-muted/50 p-5 text-center">
                      <Lock size={22} className="mx-auto text-fg-subtle" />
                      <p className="mt-2 text-[13px] font-semibold text-foreground">Sealed node</p>
                      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
                        Finish the prerequisite connected above this node to unlock it.
                      </p>
                    </div>
                  ) : (
                    <>
                      {detail.content?.videoUrl && (() => {
                        const ytEmbed = getYouTubeEmbedUrl(detail.content.videoUrl);
                        const vimeoEmbed = getVimeoEmbedUrl(detail.content.videoUrl);
                        const isDirect = isPlayableVideo(detail.content.videoUrl);

                        return (
                          <figure className="mt-4 overflow-hidden rounded-xl border border-line bg-foreground/[0.03]">
                            {isDirect ? (
                              <video
                                key={detail.content.videoUrl}
                                src={detail.content.videoUrl}
                                controls
                                preload="metadata"
                                className="w-full"
                              />
                            ) : ytEmbed ? (
                              <iframe
                                src={ytEmbed}
                                title={detail.content.videoLabel || 'Lesson video'}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="aspect-video w-full border-0"
                              />
                            ) : vimeoEmbed ? (
                              <iframe
                                src={vimeoEmbed}
                                title={detail.content.videoLabel || 'Lesson video'}
                                allow="autoplay; fullscreen; picture-in-picture"
                                allowFullScreen
                                className="aspect-video w-full border-0"
                              />
                            ) : (
                              <a
                                href={detail.content.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-2 px-3 py-3 text-[12px] font-semibold text-gold-text hover:underline"
                              >
                                <span className="flex items-center gap-2">
                                  <Film size={15} /> Watch the lesson video
                                </span>
                                <ExternalLink size={13} />
                              </a>
                            )}
                            {detail.content.videoLabel && (
                              <figcaption className="truncate border-t border-line px-3 py-2 text-[10.5px] text-fg-subtle">
                                {detail.content.videoLabel}
                              </figcaption>
                            )}
                          </figure>
                        );
                      })()}

                      {(detail.content?.sections ?? []).map((section, index) => (
                        <div key={`${index}-${section.heading}`} className="mt-4">
                          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                            <FormattedText text={section.heading} />
                          </h4>
                          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-6 text-foreground/85">
                            <FormattedText text={section.body} />
                          </p>
                        </div>
                      ))}

                      {Array.isArray(detail.content?.keyTakeaways) &&
                        detail.content.keyTakeaways.length > 0 && (
                          <ul className="mt-4 space-y-2 rounded-xl border border-line bg-muted/40 p-3.5">
                            {detail.content.keyTakeaways.map((takeaway, index) => (
                              <li
                                key={`${index}-${takeaway}`}
                                className="flex items-start gap-2 text-[11.5px] leading-5 text-foreground/85"
                              >
                                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-gold-text" />
                                <span>
                                  <FormattedText text={takeaway} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                      {detail.quiz ? (
                        <div className="mt-5" ref={quizRef}>
                          <QuizPlayer
                            key={`${detail.id}-${retakeKey}`}
                            quiz={detail.quiz}
                            onSubmit={completeModule}
                            retake={retaking}
                            disabled={detail.status === 'COMPLETED' && !retaking}
                          />
                        </div>
                      ) : (
                        <div className="mt-5 rounded-xl border border-line bg-muted/40 p-4 text-center text-[11.5px] leading-5 text-fg-muted">
                          No assessment attached — this node completes without a quiz.
                          {detail.status === 'UNLOCKED' && !isPreview && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await completeModule([]);
                                } catch (completionError) {
                                  setToast(apiError(completionError, 'Could not complete node.'));
                                }
                              }}
                              className="btn-primary mt-3 h-10 w-full text-[12px]"
                            >
                              Claim +{detail.xpReward} XP
                            </button>
                          )}
                        </div>
                      )}

                      {!isPreview && detail.viva && (
                        <div className="mt-5 rounded-2xl border border-gold/25 bg-brand-tint/60 p-4">
                          <div className="flex flex-wrap items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/12 text-gold-text">
                              <Crown size={18} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gold-text">
                                Boss battle · voice viva
                              </p>
                              <h4 className="mt-0.5 font-display text-[14px] font-semibold text-foreground">
                                {detail.viva.bossName}
                              </h4>
                              <p className="mt-1 text-[11.5px] leading-5 text-fg-muted">
                                Answer out loud, or type it if you have no microphone. The examiner
                                grades it against {detail.viva.passThreshold}% for +{detail.xpReward}{' '}
                                XP.
                              </p>
                              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] font-semibold uppercase tracking-[0.08em]">
                                {detail.status === 'COMPLETED' ? (
                                  <span className="text-success">
                                    Cleared at {detail.score}%
                                    {detail.attempts > 1 ? ` · ${detail.attempts} attempts` : ''}
                                  </span>
                                ) : detail.attempts > 0 ? (
                                  <>
                                    <span className="text-gold-text">
                                      Best attempt {detail.score}%
                                    </span>
                                    <span className="text-fg-subtle">
                                      · {detail.attempts}{' '}
                                      {detail.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
                                      {detail.viva.passThreshold}% to pass
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-fg-subtle">
                                    Not attempted yet · {detail.viva.passThreshold}% to pass
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVivaOpen(true)}
                            className="btn-primary mt-3 h-10 w-full text-[12px]"
                          >
                            <Mic size={14} /> Enter the arena
                          </button>
                        </div>
                      )}

                      {!isPreview && (detail.history?.length ?? 0) > 0 && (
                        <div className="mt-4 rounded-2xl border border-line bg-muted/40 p-3.5">
                          <div className="flex items-center gap-2">
                            <History size={13} className="text-fg-subtle" />
                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                              Attempt history
                            </p>
                            <span className="ml-auto text-[9px] uppercase tracking-[0.08em] text-fg-subtle">
                              {detail.attempts > detail.history.length
                                ? `last ${detail.history.length} of ${detail.attempts}`
                                : `${detail.history.length} total`}
                            </span>
                          </div>
                          <ol className="mt-2 space-y-1">
                            {[...detail.history].reverse().map((attempt, index) => (
                              <li
                                key={`${attempt.at}-${index}`}
                                className="flex items-center gap-2 rounded-lg px-1 py-1 text-[11px] odd:bg-foreground/[0.025]"
                              >
                                <span className="w-4 shrink-0 text-right font-mono text-[9px] text-fg-subtle">
                                  {index + 1}
                                </span>
                                <span
                                  className={`w-10 shrink-0 rounded-md py-0.5 text-center font-mono text-[10px] font-bold ${
                                    attempt.passed
                                      ? 'bg-success/12 text-success'
                                      : 'bg-danger/10 text-danger'
                                  }`}
                                >
                                  {attempt.score}%
                                </span>
                                <span className="text-fg-muted">
                                  {ATTEMPT_LABEL[attempt.source] ?? 'Attempt'}
                                </span>
                                <span className="ml-auto shrink-0 text-fg-subtle">
                                  {timeAgo(attempt.at)}
                                </span>
                              </li>
                            ))}
                          </ol>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[10px] text-fg-subtle">
                              {historySummary(detail.history) ?? 'Your tries so far.'}
                            </p>
                            {detail.status === 'COMPLETED' && (detail.quiz || detail.viva) && (
                              <button
                                type="button"
                                onClick={startRetry}
                                className="inline-flex items-center gap-1 rounded-md border border-gold/35 px-2 py-1 text-[10px] font-semibold text-gold-text transition-colors hover:bg-brand-tint"
                              >
                                <RotateCcw size={11} /> Try again
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {vivaOpen && detail?.viva && (
        <VoiceVivaDialog
          key={detail.id}
          module={detail}
          viva={detail.viva}
          standing={{ score: detail.score ?? 0, attempts: detail.attempts ?? 0 }}
          onClose={() => setVivaOpen(false)}
          onGraded={handleVivaGraded}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-line bg-card px-4 py-3 text-center text-[12px] font-medium text-foreground shadow-raised"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
