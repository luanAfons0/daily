/* A small Markdown renderer for Entry bodies and Notes, written for this page.
   It lives here rather than on a CDN because the Host serves web/ byte for
   byte and nothing else (FirstMate ADR-0008), and a Plugin Page that reaches
   the internet stops working the day the internet is not there.

   It covers what a person types in a quick note — paragraphs, headings, lists,
   quotes, code, emphasis and links — and nothing more. Every character of the
   source is escaped before any Markdown is read, so text can never become
   markup; a link keeps only an http, https or mailto address, or a relative
   one. It defines one global: renderMarkdown(text) → an HTML string. */
'use strict';

(function () {
  function escape(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** An address a link may keep, already escaped, or null for one it may not. */
  function safeAddress(escaped) {
    const plain = escaped.replace(/&amp;/g, '&').trim();
    if (/^(https?:|mailto:)/i.test(plain)) return escaped.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(plain) || plain.startsWith('//')) return null;
    return escaped.trim();
  }

  function link(text, escapedAddress) {
    const address = safeAddress(escapedAddress);
    if (address === null) return text;
    return '<a href="' + address + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  }

  /** One line of already escaped text, with its inline Markdown read. */
  function inline(escaped) {
    // Code spans first, and out of the way, so nothing inside one is read.
    const codes = [];
    let out = escaped.replace(/`([^`]+)`/g, function (_, code) {
      codes.push('<code>' + code + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    const links = [];
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, address) {
      links.push(link(text, address));
      return '\u0001' + (links.length - 1) + '\u0001';
    });
    out = out.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, function (_, before, url) {
      links.push(link(url, url));
      return before + '\u0001' + (links.length - 1) + '\u0001';
    });
    out = out
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    out = out.replace(/\u0001(\d+)\u0001/g, function (_, n) {
      return links[Number(n)];
    });
    return out.replace(/\u0000(\d+)\u0000/g, function (_, n) {
      return codes[Number(n)];
    });
  }

  const FENCE = /^\s*```/;
  const HEADING = /^(#{1,6})\s+(.*)$/;
  const QUOTE = /^\s*&gt;\s?(.*)$/;
  const BULLET = /^\s*[-*+]\s+(.*)$/;
  const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
  const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

  function renderMarkdown(source) {
    const lines = escape(String(source || '')).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') {
        i += 1;
        continue;
      }

      if (FENCE.test(line)) {
        const code = [];
        i += 1;
        while (i < lines.length && !FENCE.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }

      const heading = HEADING.exec(line);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (RULE.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      if (QUOTE.test(line)) {
        const quoted = [];
        while (i < lines.length && QUOTE.test(lines[i])) {
          quoted.push(QUOTE.exec(lines[i])[1]);
          i += 1;
        }
        // The quote was escaped once already; read it again as its own text.
        const inner = quoted.join('\n').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        out.push('<blockquote>' + renderMarkdown(inner) + '</blockquote>');
        continue;
      }

      const listKind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null;
      if (listKind) {
        const pattern = listKind === 'ul' ? BULLET : NUMBERED;
        const items = [];
        while (i < lines.length && pattern.test(lines[i])) {
          let item = pattern.exec(lines[i])[1];
          const task = /^\[([ xX])\]\s+(.*)$/.exec(item);
          item = task
            ? '<input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ' +
              inline(task[2])
            : inline(item);
          items.push('<li>' + item + '</li>');
          i += 1;
        }
        out.push('<' + listKind + '>' + items.join('') + '</' + listKind + '>');
        continue;
      }

      const paragraph = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !FENCE.test(lines[i]) &&
        !HEADING.test(lines[i]) &&
        !QUOTE.test(lines[i]) &&
        !BULLET.test(lines[i]) &&
        !NUMBERED.test(lines[i])
      ) {
        paragraph.push(inline(lines[i]));
        i += 1;
      }
      // A single newline is kept as a line break: a note is typed, not typeset.
      out.push('<p>' + paragraph.join('<br>') + '</p>');
    }

    return out.join('');
  }

  globalThis.renderMarkdown = renderMarkdown;
})();
