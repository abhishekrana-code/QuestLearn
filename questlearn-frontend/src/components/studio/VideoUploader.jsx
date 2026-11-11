import { useRef, useState } from 'react';
import { Film, Link2, Loader2, Trash2, X } from 'lucide-react';
import { apiError } from '../../services/api.js';
import {
  attachModuleVideoUrl,
  isPlayableVideo,
  removeModuleVideo,
  uploadModuleVideo,
} from '../../services/media.js';

const MAX_MB = 100;

/**
 * Lesson video for one node: drop a file, pick one, or paste a link.
 *
 * <p>Kept deliberately plain - a teacher should not have to think about formats
 * or hosting. A dropped or chosen file uploads immediately; a link is attached
 * with a button; either can be replaced or removed.</p>
 */
export default function VideoUploader({ node, onSaved }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);

  const videoUrl = node.videoUrl;
  const videoLabel = node.videoLabel;

  const apply = (data) => {
    onSaved?.(node.id, data);
  };

  const uploadFile = async (file) => {
    if (!file || busy) return;
    setError(null);

    if (!isPlayableVideo(file.name)) {
      setError('That file is not a video the browser can play. Use MP4, WebM, MOV, M4V or OGV.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(
        `That video is ${Math.round(file.size / (1024 * 1024))} MB. Keep it under ${MAX_MB} MB, or attach a link instead.`,
      );
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const data = await uploadModuleVideo(node.id, file, setProgress);
      apply(data);
    } catch (uploadError) {
      setError(apiError(uploadError, 'The video could not be uploaded.'));
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  const attachLink = async (event) => {
    event.preventDefault();
    if (!link.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await attachModuleVideoUrl(node.id, link.trim(), null);
      apply(data);
      setLink('');
      setShowLink(false);
    } catch (linkError) {
      setError(apiError(linkError, 'That link could not be attached.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await removeModuleVideo(node.id);
      apply(data);
    } catch (removeError) {
      setError(apiError(removeError, 'The video could not be removed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-line bg-card/60 p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{node.title}</p>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {videoUrl ? (videoLabel || 'Lesson video attached') : 'No lesson video yet'}
          </p>
        </div>
        {videoUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="shrink-0 text-fg-subtle transition-colors hover:text-danger disabled:opacity-50"
            aria-label={`Remove the video from ${node.title}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {videoUrl && (
        <div className="mt-2 overflow-hidden rounded-md border border-line bg-black/40">
          {isPlayableVideo(videoUrl) ? (
            <video src={videoUrl} controls preload="metadata" className="max-h-40 w-full" />
          ) : (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-arcane-text hover:underline"
            >
              <Link2 size={13} /> Open the attached video
            </a>
          )}
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`mt-2 rounded-md border border-dashed px-3 py-2 text-center transition-colors duration-150 ${
          dragging
            ? 'border-gold/70 bg-gold/[0.08]'
            : 'border-line-strong hover:border-gold/40 hover:bg-muted/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
          className="hidden"
          onChange={(event) => uploadFile(event.target.files?.[0])}
        />

        {busy ? (
          <div className="flex items-center justify-center gap-2 text-[11px] text-fg-muted">
            <Loader2 size={13} className="animate-spin" />
            {progress > 0 ? `Uploading ${progress}%` : 'Working…'}
          </div>
        ) : (
          <>
            <Film size={16} className="mx-auto text-fg-subtle" />
            <p className="mt-1 text-[11px] text-fg-muted">
              Drag a video here, or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold text-gold-text hover:underline"
              >
                choose a file
              </button>
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
              MP4 · WebM · MOV · up to {MAX_MB} MB
            </p>
          </>
        )}
      </div>

      <div className="mt-auto pt-2">
        {showLink ? (
          <form onSubmit={attachLink} className="flex items-center gap-1.5">
            <input
              type="url"
              required
              autoFocus
              placeholder="https://…"
              className="field flex-1 py-1.5 text-[11px]"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
            <button type="submit" disabled={busy} className="btn-primary px-2 py-1.5 text-[11px]">
              Attach
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLink(false);
                setLink('');
                setError(null);
              }}
              className="text-fg-subtle transition-colors hover:text-foreground"
              aria-label="Cancel attaching a link"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowLink(true)}
            className="text-[11px] font-medium text-fg-subtle transition-colors hover:text-arcane-text"
          >
            or attach a video link
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] leading-relaxed text-danger">{error}</p>}
    </div>
  );
}
