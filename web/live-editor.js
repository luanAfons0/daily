/* The text of the edit dialog, written as in Notion: every block of the
   Markdown shows formatted, and only the block being typed in shows its
   Markdown. Leave the block and it is formatted at once.

   The Markdown stays the one truth. The editor cuts it into blocks with
   markdownBlocks() from markdown.js, puts one textarea on the block that is
   open, and joins the blocks back into Markdown when that block is left. A
   block nobody opens keeps its bytes exactly.

   It defines two globals. liveEditor(root, options) → { set, get, focus }
   draws into root. liveText holds the parts that only read and write text,
   with no page, so a test can run them as the bytes a browser is served. */
'use strict';

(function () {
  /** A list item: its indent, its bullet or number, and a task box if any. */
  const ITEM = /^([ \t]*)(?:([-*+])|(\d+)([.)]))[ \t]+(\[[ xX]\][ \t]+)?/;

  /** A box of a task, in a list item or alone in a table cell, as markdown.js reads it. */
  const TASK = /(^[ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\](?=[ \t])|(\|[ \t]*)\[([ xX])\](?=[ \t]*(?:\||$))/gm;

  /** Whether the text before at is inside a code fence that is still open. */
  function inFence(value, at) {
    const fences = value.slice(0, at).split('\n').filter((line) => /^\s*```/.test(line));
    return fences.length % 2 === 1;
  }

  /**
   * What Enter does at the end of a line, as a list in Notion does it. In a
   * list item it starts the next item, with the next number and an empty
   * task box; on an item left empty it ends the list. On an empty line after
   * text it ends the block. Answers { value, at } for the new text and caret,
   * with split set when the block ends there; or null, for a plain new line.
   */
  function enter(value, at) {
    if (inFence(value, at)) return null;
    const lineStart = value.lastIndexOf('\n', at - 1) + 1;
    const line = value.slice(lineStart, at);
    const rest = value.slice(at);
    const item = ITEM.exec(line);
    if (item) {
      if (item[0].length === line.length && rest.trim() === '') {
        const kept = value.slice(0, lineStart).replace(/\n$/, '');
        return { value: kept, at: kept.length, split: true };
      }
      const bullet = item[2] || String(Number(item[3]) + 1) + item[4];
      const next = '\n' + item[1] + bullet + ' ' + (item[5] ? '[ ] ' : '');
      return { value: value.slice(0, at) + next + rest, at: at + next.length, split: false };
    }
    if (line.trim() === '' && rest.trim() === '' && value.trim() !== '') {
      const kept = value.replace(/\s+$/, '');
      return { value: kept, at: kept.length, split: true };
    }
    return null;
  }

  /** The source with its nth task box ticked or cleared, or null when none is there. */
  function toggleTask(source, nth) {
    let seen = -1;
    let changed = null;
    const out = source.replace(TASK, (whole, item, mark, cell, cellMark) => {
      seen += 1;
      if (seen !== nth) return whole;
      const flipped = (mark || cellMark) === ' ' ? 'x' : ' ';
      changed = item !== undefined ? item + '[' + flipped + ']' : cell + '[' + flipped + ']';
      return changed;
    });
    return changed === null ? null : out;
  }

  /** How many task boxes the source holds, to check it against what is drawn. */
  function countTasks(source) {
    return (source.match(TASK) || []).length;
  }

  /**
   * Where in the source a click lands, given the text shown before it. The
   * text shown is the source less its Markdown, in the same order, so each
   * shown character is found in turn and the Markdown between is passed over.
   */
  function sourceOffset(source, shown) {
    let at = 0;
    for (const char of shown) {
      const found = source.indexOf(char, at);
      if (found === -1) continue;
      at = found + 1;
    }
    return at;
  }

  /** Indent a list item by two spaces, or take two away; null when the line is no item. */
  function indent(value, at, out) {
    const lineStart = value.lastIndexOf('\n', at - 1) + 1;
    const line = value.slice(lineStart);
    if (!ITEM.test(line)) return null;
    if (!out) {
      return { value: value.slice(0, lineStart) + '  ' + line, at: at + 2 };
    }
    const cut = /^( {1,2}|\t)/.exec(line);
    if (!cut) return { value, at };
    const width = cut[0].length;
    return {
      value: value.slice(0, lineStart) + line.slice(width),
      at: Math.max(lineStart, at - width),
    };
  }

  /** Blocks joined into one Markdown text, a blank line between any two that had none. */
  function join(blocks) {
    return blocks
      .map((block, n) => block.source + (n < blocks.length - 1 ? block.after || '\n\n' : ''))
      .join('');
  }

  globalThis.liveText = { enter, toggleTask, countTasks, sourceOffset, indent, join };

  /**
   * The editor, drawn into root. options.placeholder shows while there is no
   * text; options.submit runs on Shift+Enter, as in every other field.
   */
  function liveEditor(root, options) {
    let placeholder = options.placeholder || '';
    let blocks = [];
    // The block being typed in: its place, and whether it is a new one that
    // is not in blocks yet. Null when every block shows formatted.
    let open = null;
    let area = null;
    let drawing = false;

    root.tabIndex = 0;

    function source() {
      return join(blocks);
    }

    /**
     * Put what the open block holds back into the Markdown, and cut it into
     * blocks again. Answers how many blocks it added, so a place counted
     * before it can be counted again.
     */
    function commit() {
      if (!open || !area) return 0;
      const before = blocks.length;
      const text = area.value.replace(/\s+$/, '');
      const list = blocks.slice();
      if (open.fresh) {
        if (text !== '') {
          const above = list[open.index - 1];
          if (above && !/\n[ \t]*\n/.test(above.after)) above.after = '\n\n';
          list.splice(open.index, 0, { source: text, after: '\n\n' });
        }
      } else if (text === '') {
        list.splice(open.index, 1);
      } else {
        list[open.index] = { source: text, after: list[open.index].after };
      }
      blocks = markdownBlocks(join(list));
      open = null;
      area = null;
      return blocks.length - before;
    }

    /** One block, formatted. Its task boxes can be ticked here, as in Notion. */
    function formatted(block, index) {
      const node = document.createElement('div');
      node.className = 'live-block';
      node.dataset.index = String(index);
      node.innerHTML = block.html;
      for (const box of node.querySelectorAll('input[type="checkbox"]')) box.disabled = false;
      return node;
    }

    function textarea(text) {
      const node = document.createElement('textarea');
      node.className = 'live-area';
      node.rows = 1;
      node.spellcheck = true;
      node.value = text;
      node.setAttribute('aria-label', 'Block, in Markdown');
      node.addEventListener('keydown', keys);
      node.addEventListener('blur', () => {
        if (drawing) return;
        commit();
        draw();
      });
      return node;
    }

    /** Draw every block, and the open one as a textarea with its caret at caret. */
    function draw(caret) {
      drawing = true;
      const nodes = blocks.map((block, index) =>
        open && !open.fresh && open.index === index ? (area = textarea(block.source)) : formatted(block, index),
      );
      if (open && open.fresh) nodes.splice(open.index, 0, (area = textarea('')));
      if (nodes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'live-empty';
        empty.textContent = placeholder;
        nodes.push(empty);
      }
      root.replaceChildren(...nodes);
      if (area) {
        const at = Math.max(0, Math.min(caret ?? area.value.length, area.value.length));
        area.focus();
        area.setSelectionRange(at, at);
      }
      drawing = false;
    }

    /** Leave the open block, if any, and open another: an old one, or a new one at index. */
    function openAt(index, fresh, caret) {
      open = { index, fresh };
      draw(caret);
    }

    function keys(event) {
      if (event.isComposing) return;
      const { value, selectionStart: at, selectionEnd: end } = area;
      const index = open.index;
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        commit();
        draw();
        options.submit();
      } else if (event.key === 'Escape') {
        // The first Esc leaves the block; the next one closes the dialog.
        event.preventDefault();
        event.stopPropagation();
        commit();
        draw();
        root.focus();
      } else if (event.key === 'Enter' && at === end) {
        const next = enter(value, at);
        if (!next) return;
        event.preventDefault();
        area.value = next.value;
        if (!next.split) return void area.setSelectionRange(next.at, next.at);
        const fresh = open.fresh;
        const added = commit();
        openAt(index + (fresh ? added : added + 1), true);
      } else if (event.key === 'Tab') {
        const next = indent(value, at, event.shiftKey);
        if (!next) return;
        event.preventDefault();
        area.value = next.value;
        area.setSelectionRange(next.at, next.at);
      } else if (event.key === 'ArrowUp' && at === end && !value.slice(0, at).includes('\n')) {
        if (index === 0) return;
        event.preventDefault();
        commit();
        openAt(index - 1, false);
      } else if (event.key === 'ArrowDown' && at === end && !value.slice(at).includes('\n')) {
        const fresh = open.fresh;
        if (index + (fresh ? 0 : 1) >= blocks.length) return;
        event.preventDefault();
        const added = commit();
        openAt(index + (fresh ? added : added + 1), false, 0);
      } else if (event.key === 'Backspace' && value === '' && index > 0) {
        event.preventDefault();
        commit();
        openAt(index - 1, false);
      }
    }

    /** The text shown in node before the point x, y: the text the click passed over. */
    function shownBefore(node, x, y) {
      const point = document.caretPositionFromPoint
        ? document.caretPositionFromPoint(x, y)
        : document.caretRangeFromPoint?.(x, y);
      if (!point) return null;
      const container = point.offsetNode || point.startContainer;
      const offset = point.offset ?? point.startOffset;
      if (!node.contains(container)) return null;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(container, offset);
      return range.toString();
    }

    // A press on a block opens it, with the caret where the press was. It is
    // heard on the press and not the click, because leaving the open block
    // draws the page again, and the click would land on what is gone.
    root.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (target === area) return;
      const link = target.closest('a');
      if (link && (event.ctrlKey || event.metaKey)) return;
      const node = target.closest('.live-block');
      event.preventDefault();
      const was = open;
      const added = commit();

      if (node) {
        // A block after the one just left moved by as many blocks as it added.
        let at = Number(node.dataset.index);
        if (was && (was.fresh ? at >= was.index : at > was.index)) at += added;
        const block = blocks[at];
        if (!block) return void draw();
        const box = target.closest('input[type="checkbox"]');
        if (box) {
          const boxes = [...node.querySelectorAll('input[type="checkbox"]')];
          const ticked = boxes.length === countTasks(block.source)
            ? toggleTask(block.source, boxes.indexOf(box))
            : null;
          if (ticked !== null) {
            blocks[at] = { source: ticked, after: block.after };
            blocks = markdownBlocks(join(blocks));
          }
          return void draw();
        }
        const shown = shownBefore(node, event.clientX, event.clientY);
        openAt(at, false, shown === null ? undefined : sourceOffset(block.source, shown));
        return;
      }
      // A press on the space below the blocks starts a new block at the end.
      openAt(blocks.length, true);
    });

    // A link in a block opens only with Ctrl held, since a press edits.
    root.addEventListener('click', (event) => {
      if (event.target.closest('a') && !(event.ctrlKey || event.metaKey)) event.preventDefault();
    });

    // Enter on the editor itself opens the last block, to type on from its end.
    root.addEventListener('keydown', (event) => {
      if (event.target !== root || event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      if (blocks.length === 0) openAt(0, true);
      else openAt(blocks.length - 1, false);
    });

    return {
      /** Show this Markdown, every block formatted, and this line while it is empty. */
      set(text, hint) {
        if (hint !== undefined) placeholder = hint;
        blocks = markdownBlocks(text);
        open = null;
        area = null;
        draw();
      },
      /** The Markdown as it stands, the open block's text in it. */
      get() {
        if (open) {
          commit();
          draw();
        }
        return source();
      },
      /** Focus the editor; an empty one opens a block to type in. */
      focus() {
        if (blocks.length === 0) openAt(0, true);
        else root.focus();
      },
    };
  }

  globalThis.liveEditor = liveEditor;
})();
