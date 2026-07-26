import { useMemo } from 'react';

/**
 * A tiny, dependency-free Markdown renderer.
 *
 * The knowledge base only needs headings, lists, emphasis, code, links,
 * blockquotes and rules — so rather than pulling in a parser plus a sanitiser,
 * we escape every character of user input first and then apply a small set of
 * transformations. Because escaping happens before any HTML is produced, a
 * document can never inject markup or script.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  return (
    text
      // `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // **bold**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // *italic* / _italic_
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>')
      // [label](https://…) — only http(s) links are allowed through.
      .replace(
        /\[([^\]]+)\]\((https?:&#x2F;&#x2F;[^)\s]+|https?:\/\/[^)\s]+)\)/g,
        (_match, label, href) => {
          return `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`;
        },
      )
  );
}

export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source).split(/\r?\n/);
  const html: string[] = [];

  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  let paragraph: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      closeList();
      html.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr />');
      continue;
    }

    const quote = /^&gt;\s?(.*)$/.exec(line.trim());
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }

    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ordered || unordered) {
      flushParagraph();
      const wanted = ordered ? 'ol' : 'ul';
      if (listType !== wanted) {
        closeList();
        html.push(`<${wanted}>`);
        listType = wanted;
      }
      html.push(`<li>${inline((ordered ?? unordered)![1])}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCode) html.push('</code></pre>');

  return html.join('\n');
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div
      className={className ?? 'prose-sheet'}
      // Safe: `renderMarkdown` HTML-escapes the whole document before it
      // produces any tags, so nothing from the source can become markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
