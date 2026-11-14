import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const patch = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());

vi.mock('../../services/api.js', () => ({
  default: { patch },
  apiError: (error, fallback) => error?.response?.data?.message || fallback,
}));

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ updateUser }),
}));

import DeadlinePanel from './DeadlinePanel.jsx';

const overview = {
  deadlineEmailsEnabled: true,
  deadlines: [
    {
      moduleId: 7,
      moduleTitle: 'Child node',
      courseId: 3,
      courseTitle: 'Integration Quest',
      courseEmoji: '🧪',
      dueAt: '2026-11-10T09:00:00Z',
      xpReward: 120,
      state: 'OVERDUE',
    },
    {
      moduleId: 6,
      moduleTitle: 'Root node',
      courseId: 3,
      courseTitle: 'Integration Quest',
      courseEmoji: '🧪',
      dueAt: '2026-11-20T09:00:00Z',
      xpReward: 100,
      state: 'DUE_SOON',
    },
  ],
};

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <DeadlinePanel overview={overview} {...props} />
    </MemoryRouter>,
  );

describe('DeadlinePanel', () => {
  beforeEach(() => {
    patch.mockReset();
    updateUser.mockReset();
  });

  it('shows overdue work before due-soon work', () => {
    renderPanel();

    expect(screen.getByText('Deadlines')).not.toBeNull();
    expect(screen.getByText('2 open')).not.toBeNull();
    expect(screen.getByText('Root node')).not.toBeNull();
    expect(screen.getByText('Child node')).not.toBeNull();
    expect(screen.getByText('Overdue')).not.toBeNull();
    expect(screen.getByText('Due soon')).not.toBeNull();
  });

  it('turns reminders off and reports the new preference', async () => {
    patch.mockResolvedValue({ data: { notifyDeadlines: false } });
    const onChange = vi.fn();
    renderPanel({ onChange });

    const toggle = screen.getByRole('switch', { name: /email reminders for deadlines/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/auth/notification-preferences', {
        deadlineEmails: false,
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({ notifyDeadlines: false });
    expect(onChange).toHaveBeenCalledWith({
      ...overview,
      deadlineEmailsEnabled: false,
    });
  });

  it('keeps the switch on and shows the provider error when saving fails', async () => {
    patch.mockRejectedValue({
      response: { data: { message: 'Could not update your reminder setting.' } },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('switch', { name: /email reminders for deadlines/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Could not update your reminder setting.',
      ),
    );
    expect(
      screen.getByRole('switch', { name: /email reminders for deadlines/i }).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
  });

  it('renders nothing for a learner with no dated work', () => {
    const { container } = render(
      <MemoryRouter>
        <DeadlinePanel overview={{ deadlines: [], deadlineEmailsEnabled: true }} />
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
  });
});
