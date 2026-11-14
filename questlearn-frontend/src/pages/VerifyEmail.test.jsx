import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const post = vi.hoisted(() => vi.fn());
const refreshProfile = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null }));

vi.mock('../services/api.js', () => ({
  default: { post },
  apiError: (error, fallback) => error?.response?.data?.message || fallback,
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user, refreshProfile }),
}));

vi.mock('../context/ThemeContext.jsx', () => ({
  useTheme: () => ({ theme: 'light', setTheme: () => {} }),
}));

import VerifyEmail from './VerifyEmail.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    post.mockReset();
    refreshProfile.mockReset();
    auth.user = { id: 3, emailVerified: false };
  });

  it('redeems the token and refreshes the signed-in profile', async () => {
    post.mockResolvedValue({
      data: { message: 'Email confirmed. Your account is fully set up.' },
    });
    refreshProfile.mockResolvedValue({});

    renderAt('/verify-email?token=raw-token');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/verify-email', { token: 'raw-token' }),
    );
    await waitFor(() => expect(screen.getByText(/address confirmed/i)).not.toBeNull());
    expect(screen.getByText(/account is fully set up/i)).not.toBeNull();
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('explains a link that no longer works', async () => {
    post.mockRejectedValue({
      response: { data: { message: 'This confirmation link is invalid or has expired.' } },
    });

    renderAt('/verify-email?token=stale-token');

    await waitFor(() => expect(screen.getByText(/invalid or has expired/i)).not.toBeNull());
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it('asks for the inbox link when the page is opened without a token', () => {
    renderAt('/verify-email');

    expect(screen.getByText(/needs the link from your confirmation email/i)).not.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
