import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from './useDialogFocus.js';

function Dialog({ onEscape }) {
  const ref = useRef(null);
  useDialogFocus(ref, { onEscape });
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      <button type="button">Cancel</button>
      <button type="button">Confirm</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Delete
      </button>
      {open && <Dialog onEscape={() => setOpen(false)} />}
    </div>
  );
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Delete'));

    expect(document.activeElement).toBe(screen.getByText('Cancel'));
  });

  it('keeps Tab inside the dialog by wrapping at both ends', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Delete'));

    const cancel = screen.getByText('Cancel');
    const confirm = screen.getByText('Confirm');

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('closes on Escape and gives focus back to the control that opened it', () => {
    render(<Harness />);
    const trigger = screen.getByText('Delete');
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByText('Cancel'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
