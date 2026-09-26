/* The Worklog Plugin Page. Vanilla JavaScript, no build step and no framework,
   talking to one same-origin address through call() in rpc.js. Everything it
   shows it learned by asking its own Plugin Server; it assumes nothing, and
   it keeps no data of its own. */
'use strict';

/** The four Statuses, in the order the columns stand. */
const STATUSES = [
  { name: 'Todo', dot: 'todo' },
  { name: 'In Progress', dot: 'doing' },
  { name: 'In Review', dot: 'review' },
  { name: 'Done', dot: 'done' },
];

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (value === null || value === undefined || value === false) continue;
    else node.setAttribute(key, value);
  }
  for (const child of children || []) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

const byId = (id) => document.getElementById(id);

// --- saying what is wrong -------------------------------------------------

function say(text) {
  const banner = byId('banner');
  banner.textContent = text || '';
  banner.hidden = !text;
}

// --- asking before a delete ----------------------------------------------

/**
 * Ask one yes-or-no question in the Page's own dialog, and answer whether the
 * person said yes. Closing it any other way — Keep it, Esc — is a no.
 */
function ask(question) {
  const dialog = byId('confirm-dialog');
  byId('confirm-hd').textContent = question.title;
  byId('confirm-quote').textContent = question.quote || '';
  byId('confirm-quote').hidden = !question.quote;
  byId('confirm-text').textContent = question.text;
  byId('confirm-yes').textContent = question.yes;
  // A delete is red; a question that loses nothing, such as starting a
  // Cycle, is asked in the accent instead.
  const calm = question.tone === 'calm';
  dialog.classList.toggle('calm', calm);
  byId('confirm-yes').className = 'act ' + (calm ? 'go' : 'danger-go');
  dialog.returnValue = '';
  dialog.showModal();
  byId('confirm-keep').focus();
  return new Promise((answer) => {
    dialog.addEventListener('close', () => answer(dialog.returnValue === 'yes'), { once: true });
  });
}

/** The first line of a Note, short enough to quote in a question. */
function firstLine(text) {
  const line = String(text).split('\n').find((part) => part.trim() !== '') || '';
  const plain = line.replace(/^[#>*\-+\s]+/, '').trim();
  return plain.length > 80 ? plain.slice(0, 79) + '…' : plain;
}

// --- time -----------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Tue 23 Sep and 10:00, on this machine's clock: the two halves of a name. */
function momentParts(at) {
  const when = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    day: WEEKDAYS[when.getDay()] + ' ' + when.getDate() + ' ' + MONTHS[when.getMonth()],
    time: pad(when.getHours()) + ':' + pad(when.getMinutes()),
  };
}

/** Tue 23 Sep 10:00, on this machine's clock: how a Cycle is named. */
function moment(at) {
  const parts = momentParts(at);
  return parts.day + ' ' + parts.time;
}

/**
 * How long ago a moment was, in the largest whole unit. The page reads the
 * clock only to say this; it never starts a Cycle by it (ADR-0001).
 */
function ago(at) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60000));
  const say = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return say(minutes, 'minute');
  if (minutes < 60 * 24) return say(Math.floor(minutes / 60), 'hour');
  return say(Math.floor(minutes / (60 * 24)), 'day');
}

// --- the current Cycle ----------------------------------------------------

/** A body, as Markdown shown formatted (markdown.js). */
function formatted(markdown, className) {
  const node = el('div', { class: 'md ' + className });
  node.innerHTML = renderMarkdown(markdown);
  return node;
}

function statusPicker(entry) {
  const picker = el(
    'select',
    { class: 'status-pick', 'aria-label': 'Status of ' + entry.title },
    STATUSES.map((status) =>
      el('option', { value: status.name, selected: status.name === entry.status }, [status.name]),
    ),
  );
  picker.addEventListener('change', () =>
    act(() => call('update_entry', { id: entry.id, status: picker.value })),
  );
  return picker;
}

/** The one step forward from each Status, taken with one click. */
const NEXT = {
  Todo: { status: 'In Progress', label: 'Start' },
  'In Progress': { status: 'In Review', label: 'Send to review' },
  'In Review': { status: 'Done', label: 'Mark Done' },
};

function stepButton(entry) {
  const next = NEXT[entry.status];
  if (!next) return null;
  const button = el('button', { class: 'act small step', type: 'button', text: next.label });
  button.addEventListener('click', () =>
    act(() => call('update_entry', { id: entry.id, status: next.status })),
  );
  return button;
}

// --- an Entry's Link -------------------------------------------------------

/**
 * The marks a Link can wear, one per kind of address, as inline SVG so the
 * Page loads nothing (no CDN, no web font). Each one draws in currentColor,
 * so it takes the colour of the theme.
 */
const LINK_MARKS = {
  linear:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">' +
    '<path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 ' +
    '3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65' +
    '.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443' +
    '.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 ' +
    '1-9.824-9.824Z"/></svg>',
  github:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">' +
    '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01' +
    '-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53' +
    '.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89' +
    '-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32' +
    '-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 ' +
    '1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 ' +
    '.21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  other:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

/** Which mark a Link wears, from the host it names. */
function linkKind(address) {
  const host = address.hostname.toLowerCase();
  if (host === 'linear.app' || host.endsWith('.linear.app')) return 'linear';
  if (host === 'github.com' || host === 'www.github.com') return 'github';
  return 'other';
}

/**
 * The small mark in the corner of an Entry card that opens its Link in a new
 * tab. The Plugin Server keeps only http and https Links; the Page checks
 * again, so no other address is ever put in an href. A Link it cannot read is
 * not drawn.
 */
function linkMark(link) {
  if (!link || !URL.canParse(link)) return null;
  const address = new URL(link);
  if (address.protocol !== 'http:' && address.protocol !== 'https:') return null;
  const kind = linkKind(address);
  const mark = el('a', {
    class: 'entry-link ' + kind,
    href: address.href,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: link,
    'aria-label': 'Open the Link: ' + link,
    draggable: 'false',
  });
  // A constant of this file, never anything the Entry holds.
  mark.innerHTML = LINK_MARKS[kind];
  return mark;
}

function entryCard(entry) {
  const edit = el('button', { class: 'act quiet small', type: 'button', text: 'Edit' });
  const remove = el('button', { class: 'act quiet small danger', type: 'button', text: 'Delete' });
  const status = STATUSES.find((known) => known.name === entry.status);
  const card = el('article', { class: 'card entry ' + (status ? status.dot : '') }, [
    el('div', { class: 'entry-head' }, [
      el('p', { class: 'entry-title', text: entry.title }),
      linkMark(entry.link),
    ]),
    entry.body ? formatted(entry.body, 'entry-body') : null,
    el('div', { class: 'entry-foot' }, [
      stepButton(entry),
      statusPicker(entry),
      el('span', { class: 'grow' }),
      edit,
      remove,
    ]),
  ]);
  edit.addEventListener('click', () => editEntry(entry));
  opensOnDoubleClick(card, () => editEntry(entry));
  remove.addEventListener('click', async () => {
    const yes = await ask({
      title: 'Delete this Entry?',
      quote: entry.title,
      text: 'It leaves its Cycle and the Markdown for the Meeting. You cannot undo this.',
      yes: 'Delete Entry',
    });
    if (yes) void act(() => call('delete_entry', { id: entry.id }));
  });
  return card;
}


// --- moving an Entry by dragging it -------------------------------------

/** The Entry being dragged, while one is. */
let dragged = null;

/** An Entry card in the board, which can be dragged to another column. */
function draggableCard(entry) {
  const card = entryCard(entry);
  card.draggable = true;
  card.dataset.id = String(entry.id);
  card.addEventListener('dragstart', (event) => {
    dragged = entry;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', entry.title);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    dragged = null;
    card.classList.remove('dragging');
    for (const column of document.querySelectorAll('.column.drop')) column.classList.remove('drop');
    dropLine.remove();
  });
  return card;
}

/** The line that shows where a dragged Entry would land. */
const dropLine = el('div', { class: 'drop-line', 'aria-hidden': 'true' });

/**
 * The card a dragged Entry would go above, from how far down the column the
 * pointer is: the first card whose middle is below it, or null for the end.
 */
function cardBelow(node, y) {
  const cards = [...node.querySelectorAll('.entry:not(.dragging)')];
  return cards.find((card) => {
    const box = card.getBoundingClientRect();
    return y < box.top + box.height / 2;
  }) || null;
}

/**
 * Let a column take an Entry dropped on it: from another column, which gives
 * it that Status, or from this one, which only changes its place. It lands
 * above the card under the pointer, or at the end.
 */
function dropTarget(node, status) {
  const welcome = (event) => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.classList.add('drop');
    const below = cardBelow(node, event.clientY);
    if (below) below.before(dropLine);
    else node.append(dropLine);
  };
  node.addEventListener('dragenter', welcome);
  node.addEventListener('dragover', welcome);
  node.addEventListener('dragleave', (event) => {
    if (node.contains(event.relatedTarget)) return;
    node.classList.remove('drop');
    dropLine.remove();
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('drop');
    const entry = dragged;
    const below = cardBelow(node, event.clientY);
    dropLine.remove();
    if (!entry) return;
    const before = below ? Number(below.dataset.id) : null;
    // Dropped back where it was: nothing to write.
    const next = [...node.querySelectorAll('.entry')].find(
      (card, index, all) => all[index - 1] && Number(all[index - 1].dataset.id) === entry.id,
    );
    const stays = entry.status === status.name &&
      (before === (next ? Number(next.dataset.id) : null) || before === entry.id);
    if (stays) return;
    void act(() => call('move_entry', { id: entry.id, status: status.name, before }));
  });
  return node;
}

function column(status, entries) {
  const mine = entries.filter((entry) => entry.status === status.name);
  return dropTarget(el('section', { class: 'column ' + status.dot, 'aria-label': status.name }, [
    el('div', { class: 'column-hd' }, [
      el('i', { class: 'dot ' + status.dot }),
      status.name,
      el('span', { class: 'count', text: String(mine.length) }),
    ]),
    ...(mine.length === 0
      ? [el('p', { class: 'column-empty', text: 'Nothing here.' })]
      : mine.map(draggableCard)),
  ]), status);
}

function drawCycle(view) {
  const parts = momentParts(view.cycle.startedAt);
  byId('since').replaceChildren(
    el('time', { datetime: view.cycle.startedAt }, [
      el('span', { class: 'watch-day', text: parts.day }),
      el('span', { class: 'watch-clock', text: parts.time }),
    ]),
  );

  const count = view.entries.length;
  const done = view.entries.filter((entry) => entry.status === 'Done').length;
  byId('cycle-count').textContent =
    (count === 1 ? '1 Entry' : count + ' Entries') + ' · ' + done + ' Done · started ' +
    ago(view.cycle.startedAt);
  byId('board').replaceChildren(
    ...(count === 0
      ? [el('p', { class: 'card empty', text: 'Nothing in this Cycle yet. Type above, or press N, to add an Entry.' })]
      : STATUSES.map((status) => column(status, view.entries))),
  );
}

async function load() {
  try {
    const [view, cycles, listed] = await Promise.all([
      call('get_cycle'),
      call('list_cycles'),
      call('list_notes'),
    ]);
    drawCycle(view);
    drawEarlier(cycles.cycles);
    drawNotes(listed.notes);
    say(null);
  } catch (fault) {
    say(fault.message);
  }
}

// --- the earlier Cycles --------------------------------------------------

/** The earlier Cycles a person has opened, so a redraw leaves them open. */
const opened = new Set();

function counted(counts) {
  const parts = [];
  for (const status of STATUSES) {
    const n = counts[status.name];
    if (n > 0) parts.push(n + ' ' + status.name);
  }
  return parts.length === 0 ? 'nothing recorded' : parts.join(' · ');
}

/** How tall a body in an earlier Cycle may be before it is folded, in px. */
const FOLD_AT = 168;

/**
 * Fold a long body, so that one long Entry does not push the others of its
 * Cycle out of sight. A body only a little longer is left whole: folding off
 * two lines saves nothing. A card on a hidden tab cannot be measured, so it
 * waits until its tab is shown (showTab); one already folded is left alone.
 */
function foldIfLong(card) {
  const body = card.querySelector('.entry-body');
  if (!body || body.clientWidth === 0 || card.querySelector('.unfold')) return;
  if (body.scrollHeight <= FOLD_AT + 40) return;
  body.classList.add('folded');
  const more = el('button', {
    class: 'act quiet small unfold',
    type: 'button',
    text: 'Show all',
    'aria-expanded': 'false',
  });
  more.addEventListener('click', () => {
    const open = !body.classList.toggle('folded');
    more.textContent = open ? 'Show less' : 'Show all';
    more.setAttribute('aria-expanded', String(open));
  });
  body.after(more);
}

async function fillEarlier(body, id) {
  try {
    const view = await call('get_cycle', { id: id });
    const cards = view.entries.map(entryCard);
    body.replaceChildren(
      ...(cards.length === 0
        ? [el('p', { class: 'column-empty', text: 'Nothing was Done in this Cycle.' })]
        : cards),
    );
    for (const card of cards) foldIfLong(card);
  } catch (fault) {
    say(fault.message);
  }
}

/** One mark per Entry Done in a Cycle, the way a log keeps a tally. */
function tally(done) {
  const shown = Math.min(done, 40);
  return el('span', {
    class: 'tally',
    'aria-hidden': 'true',
    style: '--marks: ' + shown,
  });
}

function earlierCycle(cycle) {
  const body = el('div', { class: 'earlier-body' });
  const item = el('details', { class: 'card earlier-cycle', open: opened.has(cycle.id) }, [
    el('summary', {}, [
      el('span', { class: 'earlier-name', text: moment(cycle.startedAt) }),
      tally(cycle.counts.Done || 0),
      el('span', { class: 'earlier-counts', text: counted(cycle.counts) }),
    ]),
    body,
  ]);
  item.addEventListener('toggle', () => {
    if (item.open) {
      opened.add(cycle.id);
      void fillEarlier(body, cycle.id);
    } else {
      opened.delete(cycle.id);
    }
  });
  if (opened.has(cycle.id)) void fillEarlier(body, cycle.id);
  return item;
}

/** Whether the earlier Cycles that hold no Entry are shown. */
let showEmpty = false;

function held(cycle) {
  return STATUSES.some((status) => cycle.counts[status.name] > 0);
}

function drawEarlier(cycles) {
  const earlier = cycles.filter((cycle) => !cycle.current);
  const kept = earlier.filter(held);
  const empty = earlier.length - kept.length;
  byId('earlier-count').textContent = kept.length > 0 ? String(kept.length) : '';

  if (earlier.length === 0) {
    byId('earlier').replaceChildren(el('p', { class: 'notes-empty', text: 'This is the first Cycle.' }));
    return;
  }
  const shown = showEmpty ? earlier : kept;
  const toggle = el('button', {
    class: 'act quiet small',
    type: 'button',
    text: showEmpty
      ? 'Hide the empty Cycles'
      : 'Show ' + (empty === 1 ? '1 empty Cycle' : empty + ' empty Cycles'),
  });
  toggle.addEventListener('click', () => {
    showEmpty = !showEmpty;
    drawEarlier(cycles);
  });
  byId('earlier').replaceChildren(
    ...(shown.length === 0
      ? [el('p', { class: 'notes-empty', text: 'No earlier Cycle has an Entry in it.' })]
      : shown.map(earlierCycle)),
    // replaceChildren writes a null as the word "null", so none is passed.
    ...(empty > 0 ? [el('p', { class: 'earlier-empty' }, [toggle])] : []),
  );
}

// --- the Notes ------------------------------------------------------------

function noteCard(note) {
  const edit = el('button', { class: 'act quiet small', type: 'button', text: 'Edit' });
  const remove = el('button', { class: 'act quiet small danger', type: 'button', text: 'Delete' });
  const card = el('article', { class: 'card note' }, [
    note.title ? el('h3', { class: 'note-title', text: note.title }) : null,
    formatted(note.body, 'note-body'),
    el('div', { class: 'entry-foot' }, [
      el('time', { class: 'hint', datetime: note.createdAt, text: moment(note.createdAt) }),
      el('span', { class: 'grow' }),
      edit,
      remove,
    ]),
  ]);
  edit.addEventListener('click', () => editNote(note));
  opensOnDoubleClick(card, () => editNote(note));
  remove.addEventListener('click', async () => {
    const yes = await ask({
      title: 'Delete this Note?',
      quote: note.title || firstLine(note.body),
      text: 'The whole Note is gone for good. You cannot undo this.',
      yes: 'Delete Note',
    });
    if (yes) void act(() => call('delete_note', { id: note.id }));
  });
  return card;
}

/** Shift+Enter in a field sends its form; in a body, Enter alone is a new line. */
function sendOnShiftEnter(body) {
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.shiftKey || event.isComposing) return;
    event.preventDefault();
    body.form.requestSubmit();
  });
}

// --- editing an Entry or a Note, in one dialog ---------------------------

/** What is open in the editor: which kind, and the Entry or Note itself. */
let editing = null;

/**
 * Open the editor dialog on an Entry or a Note. The fields are the same, a
 * title and a text; an Entry also has its Status, as chips.
 */
function openEditor(kind, item) {
  editing = { kind, item };
  const entry = kind === 'entry';
  byId('edit-hd').textContent = entry ? 'Edit Entry' : 'Edit Note';
  byId('ed-title').value = item.title;
  byId('ed-title').required = entry;
  byId('ed-body').value = item.body || '';
  byId('ed-body').required = !entry;
  byId('ed-body').placeholder = entry ? 'Details, in Markdown. Optional.' : 'The Note, in Markdown.';
  byId('ed-statuses').hidden = !entry;
  // A Link belongs to an Entry. A Note has none, so the field hides for one.
  byId('ed-link-line').hidden = !entry;
  byId('ed-link').value = entry ? item.link || '' : '';
  for (const choice of document.querySelectorAll('input[name="edit-status"]')) {
    choice.checked = entry && choice.value === item.status;
  }
  byId('ed-save').textContent = entry ? 'Save Entry' : 'Save Note';
  byId('ed-error').hidden = true;
  byId('edit-dialog').showModal();
  byId('ed-body').focus();
}

function editEntry(entry) {
  openEditor('entry', entry);
}

function editNote(note) {
  openEditor('note', note);
}

/**
 * A double-click on a card opens its editor, so a long card needs no scroll
 * down to its Edit button. A double-click on a link or a control is left to
 * that control.
 */
function opensOnDoubleClick(card, open) {
  card.addEventListener('dblclick', (event) => {
    if (event.target.closest('a, button, select, input')) return;
    window.getSelection()?.removeAllRanges();
    open();
  });
}

async function saveEdit(event) {
  event.preventDefault();
  if (!editing) return;
  const { kind, item } = editing;
  const title = byId('ed-title').value;
  const body = byId('ed-body').value;
  const button = byId('ed-save');
  button.disabled = true;
  try {
    if (kind === 'entry') {
      const chosen = document.querySelector('input[name="edit-status"]:checked');
      await call('update_entry', {
        id: item.id,
        title,
        body,
        status: chosen ? chosen.value : item.status,
        link: byId('ed-link').value,
      });
    } else {
      await call('update_note', { id: item.id, title, body });
    }
    byId('edit-dialog').close();
    say(null);
    await load();
  } catch (fault) {
    // Said in the dialog, since the banner is behind it.
    byId('ed-error').textContent = fault.message;
    byId('ed-error').hidden = false;
  } finally {
    button.disabled = false;
  }
}

byId('edit-form').addEventListener('submit', saveEdit);
byId('ed-cancel').addEventListener('click', () => byId('edit-dialog').close());
byId('ed-close').addEventListener('click', () => byId('edit-dialog').close());
byId('edit-dialog').addEventListener('close', () => (editing = null));
sendOnShiftEnter(byId('ed-title'));
sendOnShiftEnter(byId('ed-link'));
sendOnShiftEnter(byId('ed-body'));

// --- the Notes, laid out as masonry --------------------------------------

/** The narrowest a column of Notes may be, and the gap between two. */
const NOTE_WIDTH = 280;
const NOTE_GAP = 12;

/** The Note cards last drawn, newest first, and the width they were laid in. */
let noteCards = [];
let laidWidth = 0;

/**
 * Lay the Note cards out as masonry: measure each at the width of one column,
 * and a card that can be two columns wide at that width too, ask placeNotes
 * (masonry.js) where each goes, and put it there. The list is a positioned
 * box as tall as its tallest column.
 */
function layNotes() {
  const list = byId('notes');
  const width = list.clientWidth;
  // A hidden tab has no width to measure; the observer below calls again
  // when the tab is shown.
  if (width === 0 || noteCards.length === 0) return;
  laidWidth = width;
  const columns = Math.max(1, Math.floor((width + NOTE_GAP) / (NOTE_WIDTH + NOTE_GAP)));
  const single = (width - NOTE_GAP * (columns - 1)) / columns;
  const double = 2 * single + NOTE_GAP;
  // Every width is set before any height is read, so the page is laid out
  // once for each width, not once for each card.
  for (const card of noteCards) card.style.width = `${single}px`;
  list.replaceChildren(...noteCards);
  const notes = noteCards.map((card) => ({
    single: card.offsetHeight,
    double: card.offsetHeight,
    // The Markdown renderer wraps every table in this (markdown.js).
    table: card.querySelector('.note-body .table') !== null,
  }));
  // Only three columns or more give a Note two (masonry.js).
  const wideable = columns >= 3 ? notes.flatMap((note, at) => (note.table ? [at] : [])) : [];
  for (const at of wideable) noteCards[at].style.width = `${double}px`;
  for (const at of wideable) notes[at].double = noteCards[at].offsetHeight;
  const placed = placeNotes(notes, columns, innerHeight, NOTE_GAP);
  placed.places.forEach((place, at) => {
    const card = noteCards[at];
    card.style.width = `${place.span === 2 ? double : single}px`;
    card.style.left = `${place.column * (single + NOTE_GAP)}px`;
    card.style.top = `${place.top}px`;
  });
  list.style.height = `${placed.height}px`;
}

// A card's height follows its width, so the Notes are laid out again when
// the list is wider or narrower, and when the Notes tab is first shown,
// since a hidden list measured nothing.
new ResizeObserver(() => {
  const width = byId('notes').clientWidth;
  if (width > 0 && width !== laidWidth) layNotes();
}).observe(byId('notes'));

function drawNotes(notes) {
  byId('notes-count').textContent = notes.length > 0 ? String(notes.length) : '';
  noteCards = notes.map(noteCard);
  byId('notes').style.height = '';
  laidWidth = 0;
  if (notes.length === 0) {
    byId('notes').replaceChildren(el('p', { class: 'notes-empty', text: 'No Notes yet.' }));
    return;
  }
  byId('notes').replaceChildren();
  layNotes();
}

async function keepNote(event) {
  event.preventDefault();
  const title = byId('n-title');
  const body = byId('n-body');
  const button = byId('n-add');
  button.disabled = true;
  try {
    await call('create_note', { title: title.value, body: body.value });
    title.value = '';
    body.value = '';
    say(null);
    await load();
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('note-compose').addEventListener('submit', keepNote);
sendOnShiftEnter(byId('c-body'));
sendOnShiftEnter(byId('n-title'));
sendOnShiftEnter(byId('n-body'));

// Enter in a Note's title goes on to its text, since the text is what is kept.
byId('n-title').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  byId('n-body').focus();
});

/**
 * Do one write, then draw the page again from what the Plugin Server now
 * holds. The page never patches itself: the Plugin Server is the truth.
 */
async function act(write) {
  try {
    await write();
    await load();
  } catch (fault) {
    say(fault.message);
  }
}

// --- starting a Cycle -----------------------------------------------------

let noticeTimer = 0;

/** A sentence that went well, shown for a little while and then let go. */
function notice(text) {
  const node = byId('notice');
  node.textContent = text;
  node.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (node.hidden = true), 8000);
}

/**
 * Start a new Cycle by hand. Scheduler does this at every Meeting, so this is
 * for the day it did not; the question says what starting one does.
 */
async function startCycle() {
  const yes = await ask({
    title: 'Start a new Cycle?',
    text:
      'Every Entry that is not Done moves into the new Cycle. Done Entries stay ' +
      'in this one. Scheduler also starts one at every Meeting.',
    yes: 'Start a new Cycle',
    tone: 'calm',
  });
  if (!yes) return;
  const button = byId('start-cycle');
  button.disabled = true;
  try {
    const started = await call('start_cycle');
    notice(started.said);
    say(null);
    await load();
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('start-cycle').addEventListener('click', startCycle);

// --- the presentation -------------------------------------------------------

/** The order the Meeting goes in: what was Done, what waits, what is being worked on. */
const PRESENTED = ['Done', 'In Review', 'In Progress', 'Todo'];

/** Each Status's Entries for this Meeting, once asked for. */
let pool = null;
/** The slides for the Statuses chosen, and the one on the stage. */
let deck = [];
let at = 0;

/** The Statuses ticked at the top of the stage. */
function chosenToPresent() {
  return [...document.querySelectorAll('input[name="present"]:checked')].map((box) => box.value);
}

/**
 * Ask what the Meeting reports. meeting_markdown decides which Entries are
 * Done and which are being worked on, so its rules stay in one place; the
 * Cycles give their titles and details. Done may reach into the Cycle before
 * this one, so that one is read too.
 */
async function meetingPool() {
  const [meeting, current, cycles] = await Promise.all([
    call('meeting_markdown'),
    call('get_cycle'),
    call('list_cycles'),
  ]);
  const previous = cycles.cycles.find((cycle) => !cycle.current);
  const before = previous ? await call('get_cycle', { id: previous.id }) : { entries: [] };
  const known = new Map([...before.entries, ...current.entries].map((entry) => [entry.id, entry]));
  const working = meeting.workingOn.map((id) => known.get(id)).filter(Boolean);
  return {
    Done: meeting.done.map((id) => known.get(id)).filter(Boolean),
    'In Review': meeting.inReview.map((id) => known.get(id)).filter(Boolean),
    'In Progress': working.filter((entry) => entry.status === 'In Progress'),
    Todo: working.filter((entry) => entry.status === 'Todo'),
  };
}

/** Build the slides for the Statuses chosen, and stay on the same Entry if it is kept. */
function buildDeck() {
  const showing = deck[at] ? deck[at].entry.id : null;
  const chosen = chosenToPresent();
  deck = PRESENTED.filter((name) => chosen.includes(name)).flatMap((name) =>
    pool[name].map((entry, index) => ({ entry, status: name, index, of: pool[name].length })),
  );
  const kept = deck.findIndex((slide) => slide.entry.id === showing);
  at = kept === -1 ? 0 : kept;
}

/** The class a Status is drawn with, on rings, stripes and marks. */
function dotOf(name) {
  return STATUSES.find((status) => status.name === name).dot;
}

/** Draw the slide on the stage, the count and the tape. */
function drawStage(direction) {
  const slide = byId('stage-slide');
  byId('stage-prev').disabled = at <= 0;
  byId('stage-next').disabled = at >= deck.length - 1;

  if (deck.length === 0) {
    byId('stage-count').textContent = '';
    byId('stage-tape').replaceChildren();
    slide.replaceChildren(
      el('p', { class: 'slide-empty', text: 'Nothing to present. Choose a Status above.' }),
    );
    return;
  }

  const { entry, status, index, of } = deck[at];
  byId('stage-count').textContent = at + 1 + ' / ' + deck.length;
  slide.replaceChildren(
    el('div', { class: 'slide ' + (direction ? 'from-' + direction : '') }, [
      el('p', { class: 'slide-where' }, [
        el('i', { class: 'ring ' + dotOf(status) }),
        status + ' · ' + (index + 1) + ' of ' + of,
      ]),
      el('h3', { class: 'slide-title', text: entry.title }),
      entry.body
        ? formatted(entry.body, 'slide-body')
        : el('p', { class: 'slide-none', text: 'No details.' }),
    ]),
  );
  byId('stage-tape').replaceChildren(
    ...deck.map((item, i) => {
      const mark = el('button', {
        class: 'mark-tick ' + dotOf(item.status),
        type: 'button',
        title: item.entry.title,
        'aria-label': item.status + ': ' + item.entry.title,
        'aria-current': i === at ? 'step' : null,
      });
      mark.addEventListener('click', () => go(i));
      return mark;
    }),
  );
}

/** Go to one slide, by its place in the deck. */
function go(to) {
  const next = Math.max(0, Math.min(deck.length - 1, to));
  if (next === at) return;
  const direction = next > at ? 'right' : 'left';
  at = next;
  drawStage(direction);
}

async function present() {
  const button = byId('present');
  button.disabled = true;
  try {
    pool = await meetingPool();
    deck = [];
    at = 0;
    buildDeck();
    drawStage(null);
    byId('stage').showModal();
    byId('stage-next').focus();
    say(null);
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('present').addEventListener('click', present);
byId('stage-prev').addEventListener('click', () => go(at - 1));
byId('stage-next').addEventListener('click', () => go(at + 1));
byId('stage-close').addEventListener('click', () => byId('stage').close());

for (const box of document.querySelectorAll('input[name="present"]')) {
  box.addEventListener('change', () => {
    buildDeck();
    drawStage(null);
  });
}

// The arrows, Space, Page Up and Down, Home and End move through the slides;
// Esc closes the stage, as it closes every dialog. The keys are heard on the
// whole document, because Next is disabled on the last slide and a disabled
// button lets the focus fall out of the stage.
document.addEventListener('keydown', (event) => {
  if (!byId('stage').open || event.target.closest('input')) return;
  const moves = {
    ArrowRight: at + 1,
    ArrowLeft: at - 1,
    ' ': at + 1,
    PageDown: at + 1,
    PageUp: at - 1,
    Home: 0,
    End: deck.length - 1,
  };
  if (!(event.key in moves)) return;
  event.preventDefault();
  go(moves[event.key]);
});

// --- adding an Entry ------------------------------------------------------

function chosenStatus() {
  const chosen = document.querySelector('input[name="c-status"]:checked');
  return chosen ? chosen.value : 'Todo';
}

async function add(event) {
  event.preventDefault();
  const title = byId('c-title');
  const body = byId('c-body');
  const button = byId('c-add');
  button.disabled = true;
  try {
    await call('create_entry', { title: title.value, body: body.value, status: chosenStatus() });
    title.value = '';
    body.value = '';
    say(null);
    await load();
    title.focus();
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('compose').addEventListener('submit', add);

// --- the forms that open when used -----------------------------------------

/** Whether a pointer button is down, so a form knows a click is on its way. */
let pressing = false;
document.addEventListener('pointerdown', () => (pressing = true), true);
document.addEventListener('pointerup', () => setTimeout(() => (pressing = false)), true);

/**
 * A form that is one line until it is used: open while it has the focus or
 * holds any text, shut when it is left empty. It shuts only after a click
 * has finished, because shutting moves the page up, and a click that began
 * over one control would otherwise end over another.
 */
function opensWhenUsed(form) {
  const fields = [...form.querySelectorAll('input[type="text"], textarea')];
  const shut = () => {
    if (form.contains(document.activeElement)) return;
    if (fields.some((field) => field.value !== '')) return;
    form.classList.remove('open');
  };
  form.addEventListener('focusin', () => form.classList.add('open'));
  form.addEventListener('focusout', () => {
    if (!pressing) return void setTimeout(shut);
    document.addEventListener('pointerup', () => setTimeout(shut), { once: true, capture: true });
  });
}

opensWhenUsed(byId('compose'));
opensWhenUsed(byId('note-compose'));

// --- the tabs -------------------------------------------------------------

const TABS = [...document.querySelectorAll('[role="tab"]')];

/** Show one tab's panel and hide the others; the address remembers it. */
function showTab(name, focus) {
  const known = TABS.some((tab) => tab.dataset.tab === name) ? name : 'cycle';
  for (const tab of TABS) {
    const chosen = tab.dataset.tab === known;
    tab.setAttribute('aria-selected', String(chosen));
    tab.tabIndex = chosen ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !chosen;
    if (chosen && focus) tab.focus();
  }
  if (known === 'earlier') {
    for (const card of document.querySelectorAll('.earlier-body .entry')) foldIfLong(card);
  }
  history.replaceState(null, '', '#' + known);
}

for (const tab of TABS) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
  // Left and right move between tabs, as a tab list does everywhere.
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    showTab(next.dataset.tab, true);
  });
}

/** Whether a key press belongs to a field, and not to the page. */
function typing(target) {
  return target.closest('input, textarea, select, [contenteditable]') !== null;
}

// 1, 2 and 3 choose a tab; N starts an Entry. A field keeps its own keys, and
// Escape leaves the field to give them back.
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (typing(event.target)) {
    if (event.key === 'Escape' && event.target.closest('#compose, #note-compose')) event.target.blur();
    return;
  }
  const tab = { 1: 'cycle', 2: 'earlier', 3: 'notes' }[event.key];
  if (tab) {
    showTab(tab);
  } else if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    showTab('cycle');
    byId('c-title').focus();
  }
});

showTab(location.hash.slice(1));

/**
 * Draw the page again from the Plugin Server, unless an Entry or a Note is
 * open in the editor dialog: a redraw would throw away what is being typed,
 * and the editor draws the page again itself when it saves or cancels.
 */
function refresh() {
  if (document.querySelector('#edit-dialog[open]')) return;
  void load();
}

// Whatever another page added — the Popup form, or another Plugin over the
// Tool Bus — shows here the next time this page is looked at.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

// The Popup is a second window over this one, so this page stays visible and
// never hears the change above. The Popup says what it saved on a channel the
// two pages share, and this page draws it at once. Getting the focus back is
// the same news, for a window where the channel does not reach.
new BroadcastChannel('worklog').addEventListener('message', refresh);
window.addEventListener('focus', refresh);

void load();
