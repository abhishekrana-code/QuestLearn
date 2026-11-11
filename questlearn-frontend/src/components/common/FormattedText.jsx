import { Fragment } from 'react';

/**
 * Regex matching:
 * 1. Backtick code: `code`
 * 2. HTML/XML tags: <header>, <div className="foo">, </div>, <br/>
 * 3. Bold text: **bold**
 * 4. Italic text: *italic*
 */
const TOKEN_REGEX = /(`[^`]+`|<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s+[^>]*)?>|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function formatToken(token, index) {
  // Backtick code: `code`
  if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
    const inner = token.slice(1, -1);
    return (
      <code
        key={index}
        className="mx-0.5 inline-block rounded-md border border-line/50 bg-muted/80 px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-arcane-soft"
      >
        {inner}
      </code>
    );
  }

  // HTML / XML tags: <tag>, </tag>, <tag attr="val">
  if (token.startsWith('<') && token.endsWith('>')) {
    return (
      <code
        key={index}
        className="mx-0.5 inline-block rounded-md border border-arcane/20 bg-arcane/[0.08] px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-arcane-soft"
      >
        {token}
      </code>
    );
  }

  // Bold text: **bold**
  if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
    const inner = token.slice(2, -2);
    return (
      <strong key={index} className="font-semibold text-foreground">
        {inner}
      </strong>
    );
  }

  // Italic text: *italic*
  if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
    const inner = token.slice(1, -1);
    return (
      <em key={index} className="italic text-foreground/90">
        {inner}
      </em>
    );
  }

  return <Fragment key={index}>{token}</Fragment>;
}

/**
 * Parses and formats inline code tokens, HTML tags, and markdown bold/italic
 * cleanly inside text without risking XSS or requiring a heavy markdown bundle.
 */
export default function FormattedText({ text, className }) {
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') return text;

  const parts = text.split(TOKEN_REGEX);

  if (!className && parts.length === 1 && parts[0] === text) {
    return text;
  }

  const content = parts.map((part, index) => formatToken(part, index));

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return <>{content}</>;
}
