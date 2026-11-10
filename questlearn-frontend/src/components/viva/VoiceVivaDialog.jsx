import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  Crown,
  Mic,
  PenLine,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { submitViva, submitWrittenViva } from '../../services/ai.js';
import { apiError } from '../../services/api.js';

const MAX_RECORDING_MS = 80_000;
const MIN_WRITTEN_CHARS = 15;
/** Where a 70%-plus answer usually lands: three to five real sentences. */
const TARGET_WRITTEN_CHARS = 250;
const MAX_WRITTEN_CHARS = 4000;
const BAR_COUNT = 24;

/** Guidance shown while typing, so the length is known before submitting. */
function writtenHint(length) {
  if (length < MIN_WRITTEN_CHARS) {
    return {
      tone: 'text-fg-subtle',
      text: `Write at least ${MIN_WRITTEN_CHARS} characters - a full sentence.`,
    };
  }
  if (length < TARGET_WRITTEN_CHARS) {
    return {
      tone: 'text-warning',
      text: `You are at ${length} of about ${TARGET_WRITTEN_CHARS}+ characters - add another sentence or two.`,
    };
  }
  return {
    tone: 'text-rune-text',
    text: 'Good length. The examiner grades your reasoning, not the word count.',
  };
}

const IDLE_LEVELS = Array.from({ length: BAR_COUNT }, (_, index) =>
  0.16 + 0.12 * Math.abs(Math.sin(index * 0.9)),
);

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(
    totalSeconds % 60,
  ).padStart(2, '0')}`;
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? ''
  );
}

function Waveform({ levels }) {
  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden="true">
      {levels.map((level, index) => (
        <motion.span
          key={index}
          animate={{ scaleY: Math.max(0.08, level) }}
          transition={{ duration: 0.09, ease: 'linear' }}
          className="w-[3px] origin-center rounded-full bg-gradient-to-t from-gold/60 via-gold to-gold-soft"
          style={{ height: 16 + ((index * 7) % 24) }}
        />
      ))}
    </div>
  );
}

function ScoreRing({ score, passed }) {
  const angle = Math.max(0, Math.min(100, score)) * 3.6;
  return (
    <div
      className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${
          passed ? 'hsl(var(--rune))' : 'hsl(var(--danger))'
        } ${angle}deg, hsl(var(--border-strong)) ${angle}deg)`,
      }}
    >
      <div className="grid h-[70px] w-[70px] place-content-center place-items-center rounded-full bg-card">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {Math.round(score)}%
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-fg-subtle">viva</span>
      </div>
    </div>
  );
}

function BossHpBar({ viva, score }) {
  const maxHp = viva?.maxHp ?? 100;
  const hp = score == null ? maxHp : Math.max(0, Math.round(maxHp * (1 - score / 100)));
  const percent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const critical = percent <= 30;

  return (
    <div>
      <div className="flex items-end justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Boss HP</p>
        <div className="flex items-baseline gap-2">
          {score != null && (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] font-bold tabular-nums text-danger"
            >
              −{Math.round(score)} HP
            </motion.span>
          )}
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {hp}
            <span className="text-fg-subtle">/{maxHp}</span>
          </span>
        </div>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border border-line bg-muted">
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full rounded-full ${
            critical
              ? 'bg-gradient-to-r from-rose-500 via-rose-400 to-orange-300'
              : 'bg-gradient-to-r from-gold via-gold to-gold-soft'
          }`}
        />
      </div>
    </div>
  );
}

function VerdictBody({ result, onRetry, onClose }) {
  const passed = Boolean(result.passed);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gold/25 bg-gold/[0.06] p-4">
        <ScoreRing score={result.score ?? 0} passed={passed} />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-text">
            Examiner verdict
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {passed ? 'The Warden yields' : 'The Warden holds'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{result.verdict}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="chip border-gold/30 bg-gold/[0.08] text-gold-text">
              <Zap size={10} /> +{result.xpGained ?? 0} XP
            </span>
            <span className="chip border-line text-fg-muted">
              pass ≥ {result.passThreshold ?? 70}%
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-muted/40 p-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {result.input === 'WRITTEN' ? 'Your written answer' : 'Whisper transcript'}
        </p>
        <p className="mt-1.5 text-xs italic leading-relaxed text-fg-muted">“{result.transcript}”</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-rune/20 bg-rune/[0.05] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-rune-text">
            Strengths
          </p>
          <ul className="mt-1.5 space-y-1">
            {(result.strengths ?? []).map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[11px] text-fg-muted">
                <Check size={11} className="mt-0.5 shrink-0 text-rune-text" />
                {item}
              </li>
            ))}
            {(result.strengths ?? []).length === 0 && (
              <li className="text-[11px] text-fg-subtle">Nothing logged yet.</li>
            )}
          </ul>
        </div>
        <div className="rounded-lg border border-danger/20 bg-danger/[0.05] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-danger">Gaps</p>
          <ul className="mt-1.5 space-y-1">
            {(result.gaps ?? []).map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[11px] text-fg-muted">
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-danger" />
                {item}
              </li>
            ))}
            {(result.gaps ?? []).length === 0 && (
              <li className="text-[11px] text-fg-subtle">No gaps found.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gold/15 bg-gold/[0.04] p-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-text">
          Examiner feedback
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{result.feedback}</p>
        {result.followUpQuestion ? (
          <p className="mt-2 border-t border-gold/15 pt-2 text-xs leading-relaxed text-foreground">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-text">
              Follow-up ·{' '}
            </span>
            {result.followUpQuestion}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRetry} className="btn-ghost text-xs">
          <RotateCcw size={14} /> Answer again
        </button>
        <button type="button" onClick={onClose} className="btn-primary text-xs">
          Leave the arena
        </button>
      </div>
    </div>
  );
}

/**
 * Spoken boss battle for a skill node.
 *
 * <p>The browser records the answer, the backend transcribes it with Groq whisper
 * and grades it with the reasoning model. The examiner's lines are spoken back
 * with the platform speech synthesiser, so the battle reads as a conversation
 * without shipping any extra audio.</p>
 */
export default function VoiceVivaDialog({ module, viva, standing, onClose, onGraded }) {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState(IDLE_LEVELS);
  const [voiceOn, setVoiceOn] = useState(true);
  // Spoken answers are the default; typing is the fallback for a missing or
  // blocked microphone, and both submit to the same examiner.
  const [written, setWritten] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const [gradingFrom, setGradingFrom] = useState('voice');
  // A 429 means the examiner is rate-limited or busy. Retrying at once usually
  // fails again, so the panel offers the two routes that still work.
  const [busyExaminer, setBusyExaminer] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const frameRef = useRef(0);
  const timerRef = useRef(0);
  const startedAtRef = useRef(0);
  const discardingRef = useRef(false);
  const autoStopRef = useRef(0);
  const onGradedRef = useRef(onGraded);

  const bossName = viva?.bossName ?? 'The Warden';
  const openingQuestion = viva?.openingQuestion ?? 'Defend your understanding of this node.';
  const passThreshold = viva?.passThreshold ?? 70;
  const attempts = standing?.attempts ?? 0;
  const bestScore = standing?.score ?? 0;
  const hint = writtenHint(written.trim().length);

  useEffect(() => {
    onGradedRef.current = onGraded;
  }, [onGraded]);

  const speak = useCallback(
    (text) => {
      if (!voiceOn || !text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.98;
      utterance.pitch = 0.8;
      const voices = synth.getVoices();
      const preferred =
        voices.find((voice) => /^en-(US|GB)/i.test(voice.lang) && /male|daniel|alex/i.test(voice.name)) ??
        voices.find((voice) => /^en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      synth.speak(utterance);
    },
    [voiceOn],
  );

  const stopAudioGraph = useCallback(() => {
    window.clearInterval(timerRef.current);
    window.clearTimeout(autoStopRef.current);
    window.cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // Greet the student with the exam question once the arena opens.
  useEffect(() => {
    speak(openingQuestion);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes, and the page behind the dialog must not scroll.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(
    () => () => {
      discardingRef.current = true;
      if (recorderRef.current?.state === 'recording') {
        try {
          recorderRef.current.stop();
        } catch {
          /* already inactive */
        }
      }
      recorderRef.current = null;
      stopAudioGraph();
    },
    [stopAudioGraph],
  );

  useEffect(() => {
    if (phase === 'verdict' && result) {
      speak(`${result.verdict} ${result.feedback} Follow-up: ${result.followUpQuestion ?? ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const startMeter = useCallback((stream) => {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let lastPaint = 0;

      const paint = (timestamp) => {
        frameRef.current = window.requestAnimationFrame(paint);
        const active = analyserRef.current;
        if (!active || timestamp - lastPaint < 55) return;
        lastPaint = timestamp;
        active.getByteFrequencyData(buffer);
        setLevels(
          Array.from({ length: BAR_COUNT }, (_, index) => {
            const bucket = Math.floor((index / BAR_COUNT) * buffer.length * 0.55);
            return Math.max(0.08, Math.min(1, buffer[bucket] / 170));
          }),
        );
      };
      frameRef.current = window.requestAnimationFrame(paint);
    } catch {
      /* the waveform is decorative; recording still works without it */
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    setElapsedMs(0);
    discardingRef.current = false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase('error');
      setMicBlocked(true);
      setError(
        'This browser cannot reach the microphone. Use Chrome or Edge on localhost or HTTPS - or type your answer instead.',
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setPhase('error');
      setMicBlocked(true);
      setError(
        'MediaRecorder is unavailable here, so the answer cannot be recorded. You can type it instead.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        stopAudioGraph();
        setLevels(IDLE_LEVELS);
        if (discardingRef.current) return;
        if (blob.size === 0) {
          setPhase('error');
          setError('No audio was captured. Check the microphone and try again.');
          return;
        }

        setGradingFrom('voice');
        setPhase('grading');
        try {
          const graded = await submitViva(module.id, { audio: blob, durationMs });
          if (discardingRef.current) return;
          setResult(graded);
          setPhase('verdict');
          onGradedRef.current?.(graded);
        } catch (gradeError) {
          setError(apiError(gradeError, 'The Warden could not grade that answer.'));
          setBusyExaminer(gradeError?.response?.status === 429);
          setPhase('error');
        }
      };

      startMeter(stream);
      startedAtRef.current = Date.now();
      recorder.start(250);
      setPhase('recording');

      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 100);
      autoStopRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }, MAX_RECORDING_MS);
    } catch (micError) {
      stopAudioGraph();
      setPhase('error');
      setMicBlocked(true);
      setError(
        micError?.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow it in the browser and try again - or type your answer instead.'
          : 'No microphone was found. Connect one and try again - or type your answer instead.',
      );
    }
  }, [module.id, startMeter, stopAudioGraph]);

  const submitTypedAnswer = useCallback(async () => {
    const answer = written.trim();
    if (answer.length < MIN_WRITTEN_CHARS) return;

    setError(null);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setGradingFrom('typed');
    setPhase('grading');

    try {
      const graded = await submitWrittenViva(module.id, answer);
      setResult(graded);
      setPhase('verdict');
      onGradedRef.current?.(graded);
    } catch (gradeError) {
      setError(apiError(gradeError, 'The Warden could not grade that answer.'));
      setBusyExaminer(gradeError?.response?.status === 429);
      setPhase('error');
    }
  }, [module.id, written]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const handleRetry = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setResult(null);
    setError(null);
    setBusyExaminer(false);
    setElapsedMs(0);
    setPhase('idle');
  }, []);

  const recording = phase === 'recording';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Leave the arena"
        onClick={onClose}
        className="absolute inset-0 cursor-default scrim"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="viva-title"
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="panel-raised relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden shadow-raised"
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border border-gold/30 bg-gold/[0.12] text-gold-text">
            <Crown size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-text">
              Boss battle · voice viva
            </p>
            <h2 id="viva-title" className="truncate text-sm font-semibold text-foreground">
              {bossName}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setVoiceOn((current) => {
                  if (current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  return !current;
                });
              }}
              aria-label={voiceOn ? 'Mute examiner voice' : 'Unmute examiner voice'}
              className="rounded-lg border border-line bg-muted/60 p-1.5 text-fg-muted transition-colors duration-150 hover:border-gold/50 hover:text-gold-text"
            >
              {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-line bg-muted/60 p-1.5 text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3.5 sm:px-5">
          <div className="rounded-xl border border-line bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <motion.div
                animate={recording ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                transition={recording ? { duration: 2.4, repeat: Infinity } : { duration: 0.3 }}
                className="relative grid h-14 w-14 place-items-center rounded-full border border-gold/40 bg-gradient-to-br from-gold/25 to-arcane/10 text-gold-text"
              >
                <Crown size={24} />
              </motion.div>
              <div className="min-w-0 flex-1">
                <BossHpBar viva={viva} score={result?.score} />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-line bg-card/70 p-3">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-gold-text" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-text">
                  Examiner asks
                </p>
                <button
                  type="button"
                  onClick={() => speak(openingQuestion)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[9px] text-fg-subtle transition-colors duration-150 hover:border-gold/50 hover:text-gold-text"
                >
                  <Volume2 size={10} /> replay
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground">{openingQuestion}</p>
              {(viva?.topics ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {viva.topics.map((topic) => (
                    <span key={topic} className="chip border-line px-1.5 py-0.5 text-[10px] text-fg-muted">
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            {/*
              The phases are swapped without AnimatePresence on purpose: a modal
              that must wait for an exit animation to finish can wedge itself shut
              when animations are throttled (background tab, reduced motion, a
              dropped frame), leaving "Answer again" looking dead. Each panel keeps
              its enter motion and the previous one simply unmounts.
            */}
            <div>
              {phase === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-line bg-muted/30 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Mic size={14} className="text-gold-text" />
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                      Your answer
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                    {micBlocked
                      ? 'Type your answer and the same examiner will grade it. Written answers earn the same XP and unlock the same nodes.'
                      : 'Speak your answer out loud. The recording is transcribed by Groq whisper and graded by the AI examiner, who awards XP and damages the boss.'}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider">
                    {attempts > 0 ? (
                      <>
                        <span className="text-gold-text">
                          Best attempt {bestScore}% after {attempts}{' '}
                          {attempts === 1 ? 'try' : 'tries'}
                        </span>
                        <span className="text-fg-subtle"> · {passThreshold}% clears the node</span>
                      </>
                    ) : (
                      <span className="text-fg-subtle">
                        First attempt · {passThreshold}% clears the node
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
                    Speaking: answer in 3-5 sentences, up to{' '}
                    {Math.round(MAX_RECORDING_MS / 1000)}s. Typing: about 250-600 characters.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={startRecording} className="btn-primary text-xs">
                      <Mic size={15} /> Start answering
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setPhase('typing');
                      }}
                      className="btn-ghost text-xs"
                    >
                      <PenLine size={14} /> {micBlocked ? 'Type your answer' : 'Type instead'}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-fg-subtle">
                    Max {Math.round(MAX_RECORDING_MS / 1000)}s · microphone required to speak ·
                    typing always works
                  </p>
                </motion.div>
              )}

              {phase === 'typing' && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4"
                >
                  <div className="flex items-center gap-2">
                    <PenLine size={14} className="text-gold-text" />
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                      Written answer
                    </p>
                    <span className="ml-auto text-[10px] tabular-nums text-fg-subtle">
                      {written.trim().length}/{MAX_WRITTEN_CHARS}
                    </span>
                  </div>
                  <label htmlFor="viva-answer" className="sr-only">
                    Your answer to the examiner
                  </label>
                  <p className="mt-1.5 text-[10px] text-fg-subtle">
                    Aim for 3-5 sentences - roughly {TARGET_WRITTEN_CHARS}-600 characters.
                    {attempts > 0 ? ` Your best so far is ${bestScore}%.` : ''}
                  </p>
                  <textarea
                    id="viva-answer"
                    value={written}
                    onChange={(event) => setWritten(event.target.value.slice(0, MAX_WRITTEN_CHARS))}
                    rows={6}
                    autoFocus
                    placeholder="Explain it the way you would out loud: what it is, how it works, and why it matters."
                    className="field mt-2 w-full resize-y text-xs leading-relaxed"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={submitTypedAnswer}
                      disabled={written.trim().length < MIN_WRITTEN_CHARS}
                      className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Crown size={14} /> Submit to the Warden
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setPhase('idle');
                      }}
                      className="btn-ghost text-xs"
                    >
                      <RotateCcw size={14} /> Back
                    </button>
                  </div>
                  <p className={`mt-2 text-[10px] ${hint.tone}`}>{hint.text}</p>
                  <p className="mt-1 text-[10px] text-fg-subtle">
                    Graded exactly like a spoken answer: same examiner, same XP, same unlocks.
                  </p>
                </motion.div>
              )}

              {recording && (
                <motion.div
                  key="recording"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-danger/30 bg-danger/[0.06] p-4"
                >
                  <div className="flex items-center gap-2">
                    <motion.span
                      animate={{ opacity: [1, 0.25, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="h-2 w-2 rounded-full bg-danger"
                    />
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-danger">
                      Recording
                    </p>
                    <span className="ml-auto font-mono text-sm tabular-nums text-foreground">
                      {formatDuration(elapsedMs)}
                    </span>
                  </div>
                  <Waveform levels={levels} />
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:from-rose-400 hover:to-rose-500"
                  >
                    <Square size={14} /> Stop &amp; submit to the Warden
                  </button>
                </motion.div>
              )}

              {phase === 'grading' && (
                <motion.div
                  key="grading"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-line bg-muted/30 p-5 text-center"
                >
                  <Waveform levels={IDLE_LEVELS} />
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {gradingFrom === 'typed'
                      ? 'The Warden is reading your answer…'
                      : 'Whisper is transcribing your answer…'}
                  </p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-fg-subtle">
                    {gradingFrom === 'typed'
                      ? 'reasoning model → verdict'
                      : 'whisper → reasoning model → verdict'}
                  </p>
                </motion.div>
              )}

              {phase === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-danger/30 bg-danger/[0.06] p-4"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                    <p className="text-xs leading-relaxed text-danger">{error}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleRetry} className="btn-ghost text-xs">
                      <RotateCcw size={14} /> Try again
                    </button>
                    {(micBlocked || busyExaminer) && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setPhase('typing');
                        }}
                        className="btn-primary text-xs"
                      >
                        <PenLine size={14} /> Type your answer instead
                      </button>
                    )}
                    {busyExaminer && (
                      <button type="button" onClick={onClose} className="btn-ghost text-xs">
                        <X size={14} /> Take the quiz instead
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {phase === 'verdict' && result && (
                <motion.div
                  key="verdict"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <VerdictBody result={result} onRetry={handleRetry} onClose={onClose} />
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-muted/40 px-4 py-2.5 sm:px-5">
          <Shield size={12} className="text-fg-subtle" />
          <p className="text-[9px] uppercase tracking-[0.12em] text-fg-subtle">
            Audio is sent for grading and never stored · written answers go as text only
          </p>
        </div>
      </motion.div>
    </div>
  );
}
