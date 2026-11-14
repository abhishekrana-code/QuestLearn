import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const post = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null }));

vi.mock('../../services/api.js', () => ({
  default: { post },
  apiError: (error, fallback) => error?.response?.data?.message || fallback,
}));

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user }),
}));

import EmailVerificationBanner from './EmailVerificationBanner.jsx';

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    post.mockReset();
    auth.user = { id: 3, email: 'leo@questlearn.dev', emailVerified: false };
  });

  it('resends the link and says it is on its way', async () => {
    post.mockResolvedValue({ data: { message: 'A new confirmation link is on its way.' } });

    render(<EmailVerificationBanner />);

    expect(screen.getByText(/confirm your email address/i)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /resend link/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/verify-email/resend'));
    await waitFor(() => expect(screen.getByText(/a new link is on its way/i)).not.toBeNull());
  });

  it('shows the provider message when a resend is refused', async () => {
    post.mockRejectedValue({
      response: {
        data: { message: 'Too many confirmation emails for this account. Try again in an hour.' },
      },
    });

    render(<EmailVerificationBanner />);
    fireEvent.click(screen.getByRole('button', { name: /resend link/i }));

    await waitFor(() => expect(screen.getByText(/too many confirmation emails/i)).not.toBeNull());
  });

  it('stays out of the way once the address is confirmed', () => {
    auth.user = { id: 3, email: 'leo@questlearn.dev', emailVerified: true };

    const { container } = render(<EmailVerificationBanner />);

    expect(container.firstChild).toBeNull();
  });
});
