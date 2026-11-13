import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const changePassword = vi.hoisted(() => vi.fn());

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ changePassword }),
}));

import ChangePasswordDialog from './ChangePasswordDialog.jsx';

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    changePassword.mockReset();
  });

  it('refuses to submit a mismatched confirmation', () => {
    render(<ChangePasswordDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'brand-new-pass' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save password/i }));

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByText(/two new passwords do not match/i)).not.toBeNull();
  });

  it('rotates the password and says the other sessions were signed out', async () => {
    changePassword.mockResolvedValue({});

    render(<ChangePasswordDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'brand-new-pass' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'brand-new-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save password/i }));

    await waitFor(() => expect(screen.getByText(/password updated/i)).not.toBeNull());
    expect(changePassword).toHaveBeenCalledWith('secret123', 'brand-new-pass');
    expect(screen.getByText(/has been signed out/i)).not.toBeNull();
  });
});
