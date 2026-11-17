import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keyboard behaviour every modal owes the user: focus moves into the dialog,
 * Tab and Shift+Tab cycle inside it, Escape can close it, and focus returns to
 * the control that opened it.
 *
 * <p>Without the cycle, one Tab lands on the page behind the scrim, where a
 * sighted keyboard user cannot see the cursor and a screen reader reads content
 * that is supposedly unavailable. Without the restore, closing a dialog drops
 * focus on `body`, so the next Tab starts again from the top of the page.</p>
 *
 * <p>The dialog's own content may mount later (a form that loads first). In that
 * case an `autoFocus` inside the dialog wins: this hook only takes focus when
 * nothing inside the container has it yet.</p>
 */
export function useDialogFocus(containerRef, { onEscape } = {}) {
  // Held in a ref so an inline callback does not re-run the effect and reset focus.
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const previous = document.activeElement;
    const focusable = () => [...container.querySelectorAll(FOCUSABLE)];

    if (!container.contains(document.activeElement)) {
      const first = focusable()[0] ?? container;
      first.focus();
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        escapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index === -1 || index === items.length - 1
          ? 0
          : index + 1;

      event.preventDefault();
      items[next].focus();
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [containerRef]);
}
