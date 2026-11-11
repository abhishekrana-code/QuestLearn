import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormattedText from './FormattedText.jsx';

describe('FormattedText', () => {
  it('renders plain text as string', () => {
    const { container } = render(<FormattedText text="Hello World" />);
    expect(container.textContent).toBe('Hello World');
    expect(container.querySelector('code')).toBeNull();
  });

  it('formats HTML tags into code badges', () => {
    const { container } = render(
      <FormattedText text="Semantic elements: <header>, <nav>, and <footer>." />,
    );
    const codes = container.querySelectorAll('code');
    expect(codes.length).toBe(3);
    expect(codes[0].textContent).toBe('<header>');
    expect(codes[1].textContent).toBe('<nav>');
    expect(codes[2].textContent).toBe('<footer>');
  });

  it('formats inline backticks into code badges', () => {
    const { container } = render(
      <FormattedText text="Use `useState` for local state." />,
    );
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code.textContent).toBe('useState');
  });

  it('formats bold text', () => {
    const { container } = render(
      <FormattedText text="This is **important** information." />,
    );
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong.textContent).toBe('important');
  });

  it('preserves text arrows without treating them as tags', () => {
    const { container } = render(
      <FormattedText text="Controller -> Service -> Repository" />,
    );
    expect(container.textContent).toBe('Controller -> Service -> Repository');
    expect(container.querySelector('code')).toBeNull();
  });

  it('handles null and undefined gracefully', () => {
    const { container } = render(<FormattedText text={null} />);
    expect(container.textContent).toBe('');
  });
});
