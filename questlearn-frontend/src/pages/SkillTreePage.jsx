import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lock,
  Map,
  Sparkles,
  X,
} from 'lucide-react';
import QuizPlayer from '../components/quiz/QuizPlayer.jsx';
import SkillTreeCanvas from '../components/skilltree/SkillTreeCanvas.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useGamification } from '../context/GamificationContext.jsx';
import api, { apiError } from '../services/api.js';

const STATUS_STYLE = {
  COMPLETED: 'border-gold/50 bg-gold/10 text-gold',
  UNLOCKED: 'border-rune/40 bg-rune/10 text-rune',
  LOCKED: 'border-white/10 bg-white/5 text-slate-400',
};

export default function SkillTreePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const { award } = useGamification();

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const isPreview = user.role === 'INSTRUCTOR';

  const loadTree = useCallback(async () => {
    const { data } = await api.get(`/courses/${courseId}/skill-tree`);
    setTree(data);
    return data;
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTree()
      .catch((loadError) => {
        if (!cancelled) setError(apiError(loadError, 'Could not load this skill tree.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTree]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const openNode = async (node) => {
    setSelectedId(node.id);
    setDetail(null);
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

  const handleLockedClick = () => {
    setToast('This node is sealed. Clear its prerequisite to open the path.');
  };

  const completeModule = async (answers) => {
    const { data } = await api.post(`/modules/${selectedId}/complete`, { answers });
    if (data.passed) {
      award(data);
      await loadTree();
      try {
        const refreshed = await api.get(`/modules/${selectedId}`);
        setDetail(refreshed.data);
      } catch {
        /* the tree refresh is enough */
      }
      setToast(data.message);
    }
    return data;
  };

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-sm text-slate-400">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          Unrolling the map…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="panel p-8">
          <p className="text-sm text-rose-200">{error}</p>
          <Link to="/" className="btn-ghost mt-4">
            <ArrowLeft size={15} /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const percent =
    tree.totalModules > 0 ? Math.round((tree.completedModules / tree.totalModules) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <Link
          to={isPreview ? '/studio' : '/dashboard'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold"
        >
          <ArrowLeft size={14} /> {isPreview ? 'Back to studio' : 'Dashboard'}
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
              {tree.emoji || '🗺️'}
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-50 sm:text-3xl">
                {tree.courseTitle}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">{tree.courseDescription}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!isPreview && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Nodes cleared
                </p>
                <p className="font-display text-xl font-bold text-slate-50">
                  {tree.completedModules}
                  <span className="text-sm text-slate-500"> / {tree.totalModules}</span>
                </p>
              </div>
            )}
            <span className="chip border-gold/30 text-gold">
              <Sparkles size={12} /> {tree.totalXp} XP
            </span>
          </div>
        </div>

        {!isPreview && (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-rune transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {isPreview && (
          <p className="mt-4 rounded-xl border border-arcane/30 bg-arcane/10 px-3.5 py-2 text-xs text-arcane-soft">
            Instructor preview — you can play the quizzes, but XP and progress are only recorded for
            students.
          </p>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <SkillTreeCanvas
          nodes={tree.nodes}
          activeId={selectedId}
          onSelect={openNode}
          onLockedClick={handleLockedClick}
        />

        <section className="xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]">
          <div className="panel-raised flex h-full min-h-[320px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <BookOpen size={15} className="text-gold" /> Node briefing
              </h2>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-100"
                  aria-label="Close node"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!selectedId && (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-slate-500">
                      <Map size={24} />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-300">
                      Pick a node on the map
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pulses mean the node is unlocked and ready to play.
                    </p>
                  </div>
                </div>
              )}

              {detailLoading && (
                <div className="space-y-3">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-white/10" />
                  <div className="h-20 animate-pulse rounded bg-white/5" />
                  <div className="h-32 animate-pulse rounded bg-white/5" />
                </div>
              )}

              {detail && !detailLoading && (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip ${STATUS_STYLE[detail.status]}`}>{detail.status}</span>
                    <span className="chip border-gold/25 text-gold">+{detail.xpReward} XP</span>
                    {detail.status === 'COMPLETED' && (
                      <span className="chip border-emerald-400/30 text-emerald-300">
                        {detail.score}% scored
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 font-display text-xl font-bold text-slate-50">
                    {detail.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{detail.summary}</p>

                  {detail.status === 'LOCKED' ? (
                    <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                      <Lock size={22} className="mx-auto text-slate-500" />
                      <p className="mt-2 text-sm font-medium text-slate-300">Sealed node</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Finish the prerequisite connected above this node to unlock it.
                      </p>
                    </div>
                  ) : (
                    <>
                      {(detail.content?.sections ?? []).map((section) => (
                        <div key={section.heading} className="mt-4">
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-arcane-soft">
                            {section.heading}
                          </h4>
                          <p className="mt-1 text-sm leading-relaxed text-slate-300">
                            {section.body}
                          </p>
                        </div>
                      ))}

                      {Array.isArray(detail.content?.keyTakeaways) &&
                        detail.content.keyTakeaways.length > 0 && (
                          <ul className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            {detail.content.keyTakeaways.map((takeaway) => (
                              <li
                                key={takeaway}
                                className="flex items-start gap-2 text-xs text-slate-300"
                              >
                                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-gold" />
                                {takeaway}
                              </li>
                            ))}
                          </ul>
                        )}

                      {detail.quiz ? (
                        <div className="mt-5">
                          <QuizPlayer
                            key={detail.id}
                            quiz={detail.quiz}
                            onSubmit={completeModule}
                            disabled={detail.status === 'COMPLETED'}
                          />
                        </div>
                      ) : (
                        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-xs text-slate-400">
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
                              className="btn-primary mt-3 w-full text-xs"
                            >
                              Claim +{detail.xpReward} XP
                            </button>
                          )}
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

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-gold/30 bg-ink-800/95 px-4 py-3 text-center text-xs font-medium text-gold-soft shadow-glow"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
