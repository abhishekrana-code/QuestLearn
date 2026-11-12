import { RotateCcw } from 'lucide-react';

/**
 * Shown when a page could not load its data: the reason, whether automatic
 * retries are still running, and a button that restarts them.
 */
export default function LoadErrorBanner({ message, paused, onRetry, className = '' }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className={`rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 ${className}`}
    >
      <p className="text-sm text-danger">{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gold-text hover:underline"
        >
          <RotateCcw size={12} /> Try again
        </button>
        <span className="text-[11px] text-fg-muted">
          {paused ? 'Automatic retries paused.' : 'Trying again automatically…'}
        </span>
      </div>
    </div>
  );
}
