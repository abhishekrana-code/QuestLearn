import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: { id: 3, role: 'INSTRUCTOR' } }));

vi.mock('../services/api.js', () => ({
  default: { get, post, delete: del },
  apiError: (error, fallback) => error?.response?.data?.message || fallback,
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

import CourseMaterials from './CourseMaterials.jsx';

const READY = {
  id: 11,
  filename: 'notes.pdf',
  sizeBytes: 2048,
  status: 'READY',
  errorMessage: null,
  createdAt: '2026-11-18T10:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/courses/7/materials']}>
      <Routes>
        <Route path="/courses/:courseId/materials" element={<CourseMaterials />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CourseMaterials', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
    auth.user = { id: 3, role: 'INSTRUCTOR' };
    get.mockImplementation((url) =>
      url === '/courses/7'
        ? Promise.resolve({ data: { id: 7, instructorId: 3 } })
        : Promise.resolve({ data: [READY] }),
    );
  });

  it('lists the readings and offers the upload control to an instructor', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('notes.pdf')).not.toBeNull());
    expect(screen.getByText('Add a reading')).not.toBeNull();
    expect(screen.getByText('Ready')).not.toBeNull();
    expect(get).toHaveBeenCalledWith('/courses/7/materials?refresh=true');
  });

  it('keeps the upload control away from a learner', async () => {
    auth.user = { id: 9, role: 'STUDENT' };
    renderPage();

    await waitFor(() => expect(screen.getByText('notes.pdf')).not.toBeNull());
    expect(screen.queryByText('Add a reading')).toBeNull();
    expect(screen.queryByLabelText('Choose a PDF')).toBeNull();
  });

  it('keeps the upload and delete controls away from a non-owner instructor', async () => {
    auth.user = { id: 4, role: 'INSTRUCTOR' };
    renderPage();

    await waitFor(() => expect(screen.getByText('notes.pdf')).not.toBeNull());
    await waitFor(() => expect(get).toHaveBeenCalledWith('/courses/7'));
    expect(screen.queryByText('Add a reading')).toBeNull();
    expect(screen.queryByLabelText('Choose a PDF')).toBeNull();
    expect(screen.queryByLabelText('Remove notes.pdf')).toBeNull();
  });

  it('asks a question and shows the page citation that came back', async () => {
    post.mockResolvedValue({
      data: {
        answer: 'Revenue rose [S1].',
        evidenceStatus: 'SUFFICIENT',
        citations: [
          {
            materialId: 11,
            documentName: 'notes.pdf',
            pageNumber: 4,
            excerpt: 'Revenue rose 12%.',
          },
        ],
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('notes.pdf')).not.toBeNull());
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'How did revenue change?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(screen.getByText('Revenue rose [S1].')).not.toBeNull());
    expect(post).toHaveBeenCalledWith('/courses/7/materials/ask', {
      question: 'How did revenue change?',
    });
    expect(screen.getByText('page 4')).not.toBeNull();
    expect(screen.getByText(/Revenue rose 12%/)).not.toBeNull();
  });

  it('sends a chosen PDF as multipart form data', async () => {
    post.mockResolvedValue({ data: READY });
    renderPage();

    await waitFor(() => expect(screen.getByText('notes.pdf')).not.toBeNull());
    const file = new File(['%PDF-1.4'], 'chapter.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Choose a PDF'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/courses/7/materials', expect.any(FormData)),
    );
  });
});
