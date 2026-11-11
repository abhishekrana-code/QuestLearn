import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MCQCard from './MCQCard.jsx';

describe('MCQCard', () => {
  const sampleQuestions = [
    {
      id: 'q1',
      prompt: 'Which HTML element represents self-contained content?',
      options: ['<div>', '<article>', '<span>', '<table>'],
    },
  ];

  it('renders questions and formatted code options', () => {
    render(
      <MCQCard
        questions={sampleQuestions}
        answers={{}}
        onSelect={() => {}}
        disabled={false}
      />,
    );

    expect(screen.getByText(/Which HTML element/i)).not.toBeNull();
    expect(screen.getByText('<article>')).not.toBeNull();
    expect(screen.getByText('<div>')).not.toBeNull();
  });

  it('calls onSelect when an option is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <MCQCard
        questions={sampleQuestions}
        answers={{}}
        onSelect={handleSelect}
        disabled={false}
      />,
    );

    const articleButton = screen.getByText('<article>').closest('button');
    fireEvent.click(articleButton);

    expect(handleSelect).toHaveBeenCalledWith('q1', 1);
  });

  it('disables buttons when disabled prop is true', () => {
    const handleSelect = vi.fn();
    render(
      <MCQCard
        questions={sampleQuestions}
        answers={{ q1: 1 }}
        onSelect={handleSelect}
        disabled={true}
      />,
    );

    const articleButton = screen.getByText('<article>').closest('button');
    expect(articleButton.disabled).toBe(true);
  });
});
