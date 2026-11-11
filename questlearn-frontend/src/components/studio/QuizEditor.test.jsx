import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import QuizEditor, { QUIZ_TEMPLATES } from './QuizEditor.jsx';

describe('QuizEditor Component', () => {
  it('renders Multiple Choice visual builder with prompt, options, and explanation', () => {
    const handleChange = vi.fn();
    render(
      <QuizEditor
        type="MULTIPLE_CHOICE"
        value={JSON.stringify(QUIZ_TEMPLATES.MULTIPLE_CHOICE)}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText('Quiz content builder')).toBeDefined();
    expect(screen.getByDisplayValue('What does the JWT filter validate?')).toBeDefined();
    expect(screen.getByDisplayValue('The password')).toBeDefined();
    expect(screen.getByDisplayValue('The signature and expiry')).toBeDefined();
  });

  it('switches to raw JSON editor and allows editing', () => {
    const handleChange = vi.fn();
    render(
      <QuizEditor
        type="MULTIPLE_CHOICE"
        value={JSON.stringify(QUIZ_TEMPLATES.MULTIPLE_CHOICE)}
        onChange={handleChange}
      />,
    );

    const jsonBtn = screen.getByRole('button', { name: /Edit as JSON/i });
    fireEvent.click(jsonBtn);

    expect(screen.getByText('Raw JSON editor')).toBeDefined();
    expect(screen.getByRole('button', { name: /Apply JSON/i })).toBeDefined();

    const backBtn = screen.getByRole('button', { name: /Back to visual builder/i });
    fireEvent.click(backBtn);

    expect(screen.getByText('Quiz content builder')).toBeDefined();
  });

  it('renders Code Order builder when type is CODE_ORDER', () => {
    const handleChange = vi.fn();
    render(
      <QuizEditor
        type="CODE_ORDER"
        value={JSON.stringify(QUIZ_TEMPLATES.CODE_ORDER)}
        onChange={handleChange}
      />,
    );

    expect(screen.getByDisplayValue('Order these statements correctly.')).toBeDefined();
    expect(screen.getByDisplayValue('const res = await fetch(url);')).toBeDefined();
    expect(screen.getByText('Code lines ·')).toBeDefined();
  });

  it('renders Drag Drop builder when type is DRAG_DROP', () => {
    const handleChange = vi.fn();
    render(
      <QuizEditor
        type="DRAG_DROP"
        value={JSON.stringify(QUIZ_TEMPLATES.DRAG_DROP)}
        onChange={handleChange}
      />,
    );

    expect(screen.getByDisplayValue('Match each term to its meaning.')).toBeDefined();
    expect(screen.getByDisplayValue('Hibernate')).toBeDefined();
    expect(screen.getByDisplayValue('JPA implementation')).toBeDefined();
  });
});
