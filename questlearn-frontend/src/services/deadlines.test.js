import { describe, expect, it } from 'vitest';
import {
  deadlineHint,
  deadlineStateMeta,
  formatDeadline,
  fromDateTimeInput,
  isOpenDeadline,
  sortForPanel,
  toDateTimeInput,
} from './deadlines.js';

describe('deadline helpers', () => {
  it('maps every server state to readable copy', () => {
    expect(deadlineStateMeta('DUE_SOON').label).toBe('Due soon');
    expect(deadlineStateMeta('OVERDUE').label).toBe('Overdue');
    expect(deadlineStateMeta('COMPLETED_LATE').label).toBe('Done late');
    expect(deadlineStateMeta('SOMETHING_NEW')).toBeNull();
  });

  it('treats finished work as closed and everything else as open', () => {
    expect(isOpenDeadline({ state: 'OVERDUE' })).toBe(true);
    expect(isOpenDeadline({ state: 'UPCOMING' })).toBe(true);
    expect(isOpenDeadline({ state: 'COMPLETED' })).toBe(false);
    expect(isOpenDeadline({ state: 'COMPLETED_LATE' })).toBe(false);
  });

  it('puts overdue work first and finished work last', () => {
    const sorted = sortForPanel([
      { moduleTitle: 'Done', state: 'COMPLETED', dueAt: '2026-11-01T09:00:00Z' },
      { moduleTitle: 'Later', state: 'UPCOMING', dueAt: '2026-12-01T09:00:00Z' },
      { moduleTitle: 'Overdue', state: 'OVERDUE', dueAt: '2026-11-02T09:00:00Z' },
      { moduleTitle: 'Soon', state: 'DUE_SOON', dueAt: '2026-11-05T09:00:00Z' },
    ]);

    expect(sorted.map((item) => item.moduleTitle)).toEqual([
      'Overdue',
      'Soon',
      'Later',
      'Done',
    ]);
  });

  it('round-trips a datetime-local value without changing the instant', () => {
    const iso = new Date(2026, 10, 16, 9, 30).toISOString();

    const input = toDateTimeInput(iso);

    expect(input).toBe('2026-11-16T09:30');
    expect(fromDateTimeInput(input)).toBe(iso);
  });

  it('ignores empty and invalid dates', () => {
    expect(toDateTimeInput(null)).toBe('');
    expect(toDateTimeInput('not-a-date')).toBe('');
    expect(fromDateTimeInput('')).toBeNull();
    expect(fromDateTimeInput('not-a-date')).toBeNull();
    expect(formatDeadline('not-a-date')).toBe('');
  });

  it('formats a deadline with a readable date', () => {
    const text = formatDeadline('2026-11-16T09:30:00Z', 'en-GB');

    expect(text).toContain('Nov');
    expect(text).toContain('2026');
  });

  it('only puts a warning on the map when it needs one', () => {
    expect(deadlineHint('OVERDUE')).toEqual({ label: 'Overdue', tone: 'text-danger' });
    expect(deadlineHint('DUE_SOON')).toEqual({ label: 'Due soon', tone: 'text-warning' });
    expect(deadlineHint('COMPLETED_LATE')).toEqual({
      label: 'Done late',
      tone: 'text-warning',
    });
    expect(deadlineHint('UPCOMING')).toBeNull();
    expect(deadlineHint('COMPLETED')).toBeNull();
  });
});
