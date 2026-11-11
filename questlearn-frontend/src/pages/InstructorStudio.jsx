import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  FilePlus2,
  ListTree,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import LessonEditor from '../components/studio/LessonEditor.jsx';
import NodeEditorDialog from '../components/studio/NodeEditorDialog.jsx';
import VideoUploader from '../components/studio/VideoUploader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { generateCourse as requestGeneratedCourse, getAiStatus } from '../services/ai.js';
import api, { apiError } from '../services/api.js';
import { EMPTY_LESSON, lessonPayload } from '../services/lesson.js';

const QUIZ_TEMPLATES = {
  MULTIPLE_CHOICE: JSON.stringify(
    {
      questions: [
        {
          id: 'q1',
          prompt: 'What does the JWT filter validate?',
          options: ['The password', 'The signature and expiry', 'The database schema', 'The CSS'],
          correctIndex: 1,
          explanation: 'Signature + expiry are checked on every request.',
        },
      ],
    },
    null,
    2,
  ),
  CODE_ORDER: JSON.stringify(
    {
      prompt: 'Order these statements correctly.',
      lines: ['const res = await fetch(url);', 'if (!res.ok) throw new Error();', 'return res.json();'],
      explanation: 'Check the status before parsing.',
    },
    null,
    2,
  ),
  DRAG_DROP: JSON.stringify(
    {
      prompt: 'Match each term to its meaning.',
      pairs: [
        { left: 'Hibernate', right: 'JPA implementation' },
        { left: 'HikariCP', right: 'Connection pool' },
      ],
    },
    null,
    2,
  ),
};

const EMPTY_COURSE = { title: '', description: '', category: '', emoji: '🗺️' };

export default function InstructorStudio() {
  const { user } = useAuth();

  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [moduleForm, setModuleForm] = useState({
    title: '',
    summary: '',
    xpReward: 100,
    parentModuleId: '',
    positionX: 0,
    positionY: 0,
    content: EMPTY_LESSON,
  });
  const [editingNode, setEditingNode] = useState(null);
  const [quizForm, setQuizForm] = useState({
    moduleId: '',
    type: 'MULTIPLE_CHOICE',
    passingScore: 60,
    payload: QUIZ_TEMPLATES.MULTIPLE_CHOICE,
  });
  const [aiStatus, setAiStatus] = useState(null);
  const [aiForm, setAiForm] = useState({ topic: '', audience: '', category: '', nodeCount: 6 });
  const [generating, setGenerating] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedId) ?? null,
    [courses, selectedId],
  );

  const notify = (type, text) => setMessage({ type, text });

  const loadCourses = useCallback(async (preferredId) => {
    const { data } = await api.get('/courses');
    setCourses(data);
    setSelectedId((current) => preferredId ?? current ?? data[0]?.id ?? null);
    return data;
  }, []);

  const loadNodes = useCallback(async (courseId) => {
    if (!courseId) {
      setNodes([]);
      return;
    }
    const { data } = await api.get(`/courses/${courseId}/skill-tree`);
    setNodes(data.nodes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadCourses();
        if (!cancelled && data[0]) {
          await loadNodes(data[0].id);
        }
      } catch (error) {
        if (!cancelled) notify('error', apiError(error, 'Could not load your courses.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCourses, loadNodes]);

  useEffect(() => {
    getAiStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false, unreachable: true }));
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadNodes(selectedId).catch((error) =>
        notify('error', apiError(error, 'Could not load this skill tree.')),
      );
      setQuizForm((previous) => ({ ...previous, moduleId: '' }));
    }
  }, [selectedId, loadNodes]);

  const createCourse = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/courses', {
        title: courseForm.title,
        description: courseForm.description,
        category: courseForm.category,
        emoji: courseForm.emoji,
      });
      setCourseForm(EMPTY_COURSE);
      await loadCourses(data.id);
      await loadNodes(data.id);
      notify('success', `Draft "${data.title}" created. Add nodes, then publish it.`);
    } catch (error) {
      notify('error', apiError(error, 'Could not create the course.'));
    } finally {
      setBusy(false);
    }
  };

  const generateWithAi = async (event) => {
    event.preventDefault();
    if (!aiForm.topic.trim()) return;
    setGenerating(true);
    try {
      const draft = await requestGeneratedCourse({
        topic: aiForm.topic.trim(),
        audience: aiForm.audience.trim() || undefined,
        category: aiForm.category.trim() || undefined,
        nodeCount: Number(aiForm.nodeCount),
      });
      setAiForm((previous) => ({ ...previous, topic: '' }));
      await loadCourses(draft.courseId);
      await loadNodes(draft.courseId);
      const warnings = draft.warnings ?? [];
      notify(
        'success',
        `Drafted "${draft.title}" with ${draft.nodeCount} node(s). Review it, then publish.` +
          (warnings.length > 0 ? ` ${warnings[0]}` : ''),
      );
    } catch (error) {
      notify('error', apiError(error, 'The AI could not draft that course.'));
    } finally {
      setGenerating(false);
    }
  };

  /** Keeps the node list in step with an upload, link or removal. */
  const saveVideo = useCallback((moduleId, data) => {
    setNodes((previous) =>
      previous.map((item) =>
        item.id === moduleId
          ? { ...item, videoUrl: data.videoUrl, videoLabel: data.videoLabel }
          : item,
      ),
    );
    notify('success', data.videoUrl ? 'Lesson video saved.' : 'Lesson video removed.');
  }, []);

  /** Refreshes the tree after a node edit, so the table and tree agree. */
  const saveNodeEdits = useCallback(
    async (saved) => {
      setEditingNode(null);
      if (selectedId) {
        await loadNodes(selectedId).catch(() => {});
        await loadCourses(selectedId).catch(() => {});
      }
      notify('success', `"${saved?.title ?? 'Node'}" updated.`);
    },
    [selectedId, loadNodes, loadCourses],
  );

  const togglePublish = async (course) => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/courses/${course.id}/publish`, null, {
        params: { published: !course.published },
      });
      setCourses((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      notify('success', data.published ? 'Course is now live for students.' : 'Course unpublished.');
    } catch (error) {
      notify('error', apiError(error, 'Could not change the publish state.'));
    } finally {
      setBusy(false);
    }
  };

  const addModule = async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.post(`/courses/${selectedId}/modules`, {
        title: moduleForm.title,
        summary: moduleForm.summary,
        xpReward: Number(moduleForm.xpReward),
        parentModuleId: moduleForm.parentModuleId ? Number(moduleForm.parentModuleId) : null,
        positionX: Number(moduleForm.positionX),
        positionY: Number(moduleForm.positionY),
        content: lessonPayload(moduleForm.content),
      });
      setModuleForm({
        title: '',
        summary: '',
        xpReward: 100,
        parentModuleId: moduleForm.parentModuleId,
        positionX: Number(moduleForm.positionX) + 1,
        positionY: Number(moduleForm.positionY) + 1,
        content: EMPTY_LESSON,
      });
      await loadNodes(selectedId);
      await loadCourses(selectedId);
      notify('success', 'Skill node added to the tree.');
    } catch (error) {
      notify('error', apiError(error, 'Could not add the node.'));
    } finally {
      setBusy(false);
    }
  };

  const attachQuiz = async (event) => {
    event.preventDefault();
    if (!quizForm.moduleId) return;
    setBusy(true);
    try {
      const payload = JSON.parse(quizForm.payload);
      await api.post(`/modules/${quizForm.moduleId}/quiz`, {
        type: quizForm.type,
        passingScore: Number(quizForm.passingScore),
        payload,
      });
      await loadNodes(selectedId);
      notify('success', 'Quiz attached to the selected node.');
    } catch (error) {
      notify(
        'error',
        error instanceof SyntaxError
          ? 'Quiz payload must be valid JSON.'
          : apiError(error, 'Could not attach the quiz.'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center text-sm text-slate-400">
        Opening the workshop…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <p className="eyebrow">Instructor studio</p>
        <h1 className="page-title mt-2">Build the quest map</h1>
        <p className="page-subtitle mt-1.5 max-w-2xl">
          Create a course, link nodes as a tree, then attach a lesson, a video and a quiz to each
          node.
        </p>
      </header>

      {message && (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
              : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[330px_1fr]">
        <aside className="space-y-5">
          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wand2 size={15} className="text-arcane-text" /> AI quest builder
            </h2>

            {aiStatus && !aiStatus.configured ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                {aiStatus.unreachable
                  ? 'The AI status endpoint is unreachable - is the API running?'
                  : 'Add GROQ_API_KEY to questlearn-backend/.env and restart the API to draft a whole quest from one sentence.'}
              </p>
            ) : (
              <form onSubmit={generateWithAi} className="mt-4 space-y-3">
                <div>
                  <label className="label" htmlFor="ai-topic">
                    Topic
                  </label>
                  <textarea
                    id="ai-topic"
                    required
                    rows={2}
                    className="field resize-none"
                    placeholder="Graph algorithms for beginners: BFS, DFS, shortest paths"
                    value={aiForm.topic}
                    onChange={(event) => setAiForm({ ...aiForm, topic: event.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="ai-audience">
                      Audience
                    </label>
                    <input
                      id="ai-audience"
                      className="field"
                      placeholder="First-year CS"
                      value={aiForm.audience}
                      onChange={(event) => setAiForm({ ...aiForm, audience: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="ai-nodes">
                      Nodes
                    </label>
                    <select
                      id="ai-nodes"
                      className="field"
                      value={aiForm.nodeCount}
                      onChange={(event) =>
                        setAiForm({ ...aiForm, nodeCount: Number(event.target.value) })
                      }
                    >
                      {[3, 4, 5, 6, 7, 8].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={generating || busy} className="btn-arcane w-full">
                  <Sparkles size={15} />
                  {generating ? 'Drafting your quest…' : 'Generate draft quest'}
                </button>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Each node gets lesson sections, takeaways, a multiple-choice quiz and a voice
                  viva. Generates as a draft you can edit.
                </p>
              </form>
            )}
          </div>

          <form onSubmit={createCourse} className="panel-raised p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FilePlus2 size={15} className="text-gold-text" /> New course
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="course-title">
                  Title
                </label>
                <input
                  id="course-title"
                  required
                  className="field"
                  placeholder="Data Structures Dungeon"
                  value={courseForm.title}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, title: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="course-description">
                  Description
                </label>
                <textarea
                  id="course-description"
                  rows={3}
                  className="field resize-none"
                  placeholder="What will students conquer?"
                  value={courseForm.description}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, description: event.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-[1fr_84px] gap-3">
                <div>
                  <label className="label" htmlFor="course-category">
                    Category
                  </label>
                  <input
                    id="course-category"
                    className="field"
                    placeholder="Computer Science"
                    value={courseForm.category}
                    onChange={(event) =>
                      setCourseForm({ ...courseForm, category: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="course-emoji">
                    Emoji
                  </label>
                  <input
                    id="course-emoji"
                    maxLength={4}
                    className="field text-center"
                    value={courseForm.emoji}
                    onChange={(event) =>
                      setCourseForm({ ...courseForm, emoji: event.target.value })
                    }
                  />
                </div>
              </div>

              <button type="submit" disabled={busy} className="btn-arcane w-full">
                <Plus size={15} /> Create draft
              </button>
            </div>
          </form>

          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListTree size={15} className="text-rune-text" /> Your courses
            </h2>

            <div className="mt-3 space-y-2">
              {courses.length === 0 && (
                <p className="text-xs text-slate-500">No courses yet — create your first draft.</p>
              )}
              {courses.map((course) => {
                const active = course.id === selectedId;
                const owned = course.instructorId === user.id || user.role === 'ADMIN';
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedId(course.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-gold/50 bg-gold/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{course.emoji || '🗺️'}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
                        {course.title}
                      </span>
                      <span
                        className={`chip px-1.5 py-0.5 text-[9px] ${
                          course.published
                            ? 'border-emerald-400/30 text-emerald-300'
                            : 'border-amber-400/30 text-amber-300'
                        }`}
                      >
                        {course.published ? 'live' : 'draft'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                      {course.moduleCount} nodes{owned ? '' : ' · read only'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          {!selectedCourse ? (
            <div className="panel grid min-h-[240px] place-items-center p-8 text-sm text-slate-400">
              Select or create a course to start mapping nodes.
            </div>
          ) : (
            <>
              <div className="panel-raised flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-slate-50">
                      {selectedCourse.title}
                    </h2>
                    <span
                      className={`chip ${
                        selectedCourse.published
                          ? 'border-emerald-400/30 text-emerald-300'
                          : 'border-amber-400/30 text-amber-300'
                      }`}
                    >
                      {selectedCourse.published ? 'published' : 'draft'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedCourse.moduleCount} nodes · {selectedCourse.category || 'uncategorised'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link to={`/courses/${selectedCourse.id}`} className="btn-ghost px-3 py-2 text-xs">
                    <Eye size={14} /> Preview
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => togglePublish(selectedCourse)}
                    className={selectedCourse.published ? 'btn-danger px-3 py-2 text-xs' : 'btn-primary px-3 py-2 text-xs'}
                  >
                    {selectedCourse.published ? <EyeOff size={14} /> : <Eye size={14} />}
                    {selectedCourse.published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </div>

              <form onSubmit={addModule} className="panel-raised p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Plus size={15} className="text-gold-text" /> Add a skill node
                </h3>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="module-title">
                      Node title
                    </label>
                    <input
                      id="module-title"
                      required
                      className="field"
                      placeholder="Binary Search Boss"
                      value={moduleForm.title}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, title: event.target.value })
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="module-summary">
                      Summary
                    </label>
                    <input
                      id="module-summary"
                      className="field"
                      placeholder="One line shown on the skill tree"
                      value={moduleForm.summary}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, summary: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="module-parent">
                      Prerequisite node
                    </label>
                    <select
                      id="module-parent"
                      className="field"
                      value={moduleForm.parentModuleId}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, parentModuleId: event.target.value })
                      }
                    >
                      <option value="">— Root node (no prerequisite) —</option>
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="module-xp">
                      XP reward
                    </label>
                    <input
                      id="module-xp"
                      type="number"
                      min={0}
                      max={5000}
                      className="field"
                      value={moduleForm.xpReward}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, xpReward: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="module-x">
                      Column (X)
                    </label>
                    <input
                      id="module-x"
                      type="number"
                      min={0}
                      className="field"
                      value={moduleForm.positionX}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, positionX: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="module-y">
                      Row (Y)
                    </label>
                    <input
                      id="module-y"
                      type="number"
                      min={0}
                      className="field"
                      value={moduleForm.positionY}
                      onChange={(event) =>
                        setModuleForm({ ...moduleForm, positionY: event.target.value })
                      }
                    />
                  </div>

                  <div className="sm:col-span-2 rounded-lg border border-line bg-muted/30 p-3">
                    <LessonEditor
                      value={moduleForm.content}
                      onChange={(content) => setModuleForm({ ...moduleForm, content })}
                      disabled={busy}
                    />
                  </div>
                </div>

                <button type="submit" disabled={busy} className="btn-primary mt-4">
                  <Save size={15} /> Add node
                </button>
              </form>

              <form onSubmit={attachQuiz} className="panel-raised p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles size={15} className="text-arcane-text" /> Attach a JSONB quiz
                </h3>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="quiz-module">
                      Node
                    </label>
                    <select
                      id="quiz-module"
                      required
                      className="field"
                      value={quizForm.moduleId}
                      onChange={(event) =>
                        setQuizForm({ ...quizForm, moduleId: event.target.value })
                      }
                    >
                      <option value="">Select a node…</option>
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="quiz-type">
                      Type
                    </label>
                    <select
                      id="quiz-type"
                      className="field"
                      value={quizForm.type}
                      onChange={(event) =>
                        setQuizForm({
                          ...quizForm,
                          type: event.target.value,
                          payload: QUIZ_TEMPLATES[event.target.value],
                        })
                      }
                    >
                      <option value="MULTIPLE_CHOICE">Multiple choice</option>
                      <option value="CODE_ORDER">Code ordering</option>
                      <option value="DRAG_DROP">Drag &amp; drop matching</option>
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="quiz-pass">
                      Passing score (%)
                    </label>
                    <input
                      id="quiz-pass"
                      type="number"
                      min={0}
                      max={100}
                      className="field"
                      value={quizForm.passingScore}
                      onChange={(event) =>
                        setQuizForm({ ...quizForm, passingScore: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <label className="label" htmlFor="quiz-payload">
                      Payload
                    </label>
                    <button
                      type="button"
                      className="mb-1.5 text-[11px] font-semibold text-gold-text hover:underline"
                      onClick={() =>
                        setQuizForm({ ...quizForm, payload: QUIZ_TEMPLATES[quizForm.type] })
                      }
                    >
                      Reset to template
                    </button>
                  </div>
                  <textarea
                    id="quiz-payload"
                    rows={12}
                    spellCheck={false}
                    className="field resize-y bg-muted/40 font-mono text-[12px] leading-relaxed"
                    value={quizForm.payload}
                    onChange={(event) =>
                      setQuizForm({ ...quizForm, payload: event.target.value })
                    }
                  />
                </div>

                <button type="submit" disabled={busy || !quizForm.moduleId} className="btn-arcane mt-4">
                  <Save size={15} /> Attach quiz
                </button>
              </form>

              <div className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Lesson videos</h3>
                  <span className="chip border-line text-fg-muted">drag · upload · link</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
                  Students see this at the top of the node briefing. Drop a file, upload one, or
                  point at a video that is already hosted somewhere.
                </p>
                {nodes.length === 0 ? (
                  <p className="mt-3 text-xs text-fg-subtle">Add a node first.</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {nodes.map((node) => (
                      <VideoUploader key={node.id} node={node} onSaved={saveVideo} />
                    ))}
                  </div>
                )}
              </div>

              <div className="panel p-5">
                <h3 className="text-sm font-semibold text-foreground">Node overview</h3>
                {nodes.length === 0 ? (
                  <p className="mt-2 text-xs text-fg-subtle">No nodes yet.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                        <tr>
                          <th className="pb-2 pr-3 font-semibold">Node</th>
                          <th className="pb-2 pr-3 font-semibold">Prerequisite</th>
                          <th className="pb-2 pr-3 font-semibold">Pos</th>
                          <th className="pb-2 pr-3 font-semibold">XP</th>
                          <th className="pb-2 pr-3 font-semibold">Quiz</th>
                          <th className="pb-2 text-right font-semibold">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {nodes.map((node) => (
                          <tr key={node.id} className="transition-colors hover:bg-muted/40">
                            <td className="py-2 pr-3 font-medium text-foreground">{node.title}</td>
                            <td className="py-2 pr-3 text-fg-muted">
                              {nodes.find((candidate) => candidate.id === node.parentId)?.title ??
                                '—'}
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-fg-subtle">
                              {node.positionX},{node.positionY}
                            </td>
                            <td className="py-2 pr-3 font-semibold tabular-nums text-gold-text">
                              {node.xpReward}
                            </td>
                            <td className="py-2 pr-3 text-fg-muted">{node.quizType ?? 'none'}</td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                aria-label={`Edit ${node.title}`}
                                onClick={() => setEditingNode(node)}
                                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-fg-muted transition-colors duration-150 hover:border-gold/50 hover:text-gold-text"
                              >
                                <PencilLine size={12} /> Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {editingNode && (
                <NodeEditorDialog
                  node={editingNode}
                  onClose={() => setEditingNode(null)}
                  onSaved={saveNodeEdits}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
