/* The Daily Plugin Page. Vanilla JavaScript, no build step and no framework,
   talking to one same-origin address through call() in rpc.js. Everything it
   shows it learned by asking its own Plugin Server; it assumes nothing, and
   it keeps no data of its own. */
'use strict';

/** The three Statuses, in the order the columns stand. */
const STATUSES = [
  { name: 'Todo', dot: 'todo' },
  { name: 'In Progress', dot: 'doing' },
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
  'In Progress': { status: 'Done', label: 'Mark Done' },
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

function entryCard(entry) {
  const edit = el('button', { class: 'act quiet small', type: 'button', text: 'Edit' });
  const remove = el('button', { class: 'act quiet small danger', type: 'button', text: 'Delete' });
  const status = STATUSES.find((known) => known.name === entry.status);
  const card = el('article', { class: 'card entry ' + (status ? status.dot : '') }, [
    el('p', { class: 'entry-title', text: entry.title }),
    entry.body ? formatted(entry.body, 'entry-body') : null,
    el('div', { class: 'entry-foot' }, [
      stepButton(entry),
      statusPicker(entry),
      el('span', { class: 'grow' }),
      edit,
      remove,
    ]),
  ]);
  edit.addEventListener('click', () => card.replaceWith(entryEditor(entry)));
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

/** The same Entry, open for its title and body to be edited in place. */
function entryEditor(entry) {
  const title = el('input', { class: 'input', type: 'text', 'aria-label': 'Title' });
  title.value = entry.title;
  const body = el('textarea', { class: 'input', rows: '4', 'aria-label': 'Body' });
  body.value = entry.body || '';
  const form = el('form', { class: 'card entry editing' }, [
    title,
    body,
    el('div', { class: 'entry-foot' }, [
      el('span', { class: 'hint', text: 'Markdown. Esc to cancel.' }),
      el('span', { class: 'grow' }),
      el('button', { class: 'act quiet small', type: 'button', text: 'Cancel', 'data-cancel': '' }),
      el('button', { class: 'act go small', type: 'submit', text: 'Save' }),
    ]),
  ]);
  const cancel = () => void load();
  form.querySelector('[data-cancel]').addEventListener('click', cancel);
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void act(() => call('update_entry', { id: entry.id, title: title.value, body: body.value }));
  });
  queueMicrotask(() => title.focus());
  return form;
}

// --- moving an Entry by dragging it -------------------------------------

/** The Entry being dragged, while one is. */
let dragged = null;

/** An Entry card in the board, which can be dragged to another column. */
function draggableCard(entry) {
  const card = entryCard(entry);
  card.draggable = true;
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
  });
  return card;
}

/** Let a column take an Entry dropped on it, and give it that column's Status. */
function dropTarget(node, status) {
  const welcome = (event) => {
    if (!dragged || dragged.status === status.name) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.classList.add('drop');
  };
  node.addEventListener('dragenter', welcome);
  node.addEventListener('dragover', welcome);
  node.addEventListener('dragleave', (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove('drop');
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('drop');
    const entry = dragged;
    if (!entry || entry.status === status.name) return;
    void act(() => call('update_entry', { id: entry.id, status: status.name }));
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

async function fillEarlier(body, id) {
  try {
    const view = await call('get_cycle', { id: id });
    body.replaceChildren(
      ...(view.entries.length === 0
        ? [el('p', { class: 'column-empty', text: 'Nothing was Done in this Cycle.' })]
        : view.entries.map(entryCard)),
    );
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
    empty > 0 ? el('p', { class: 'earlier-empty' }, [toggle]) : null,
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
  edit.addEventListener('click', () => card.replaceWith(noteEditor(note)));
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

/** Shift+Enter in a Note's body sends its form; Enter alone is a new line. */
function sendOnShiftEnter(body) {
  body.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.shiftKey || event.isComposing) return;
    event.preventDefault();
    body.form.requestSubmit();
  });
}

/** The same Note, open for its body to be edited in place. */
function noteEditor(note) {
  const title = el('input', {
    class: 'input note-title-input',
    type: 'text',
    placeholder: 'Title',
    'aria-label': 'Title',
  });
  title.value = note.title;
  const body = el('textarea', { class: 'input', rows: '5', 'aria-label': 'Note' });
  body.value = note.body;
  sendOnShiftEnter(title);
  sendOnShiftEnter(body);
  const form = el('form', { class: 'card note editing' }, [
    title,
    body,
    el('div', { class: 'entry-foot' }, [
      el('span', { class: 'hint', text: 'Markdown. Shift+Enter saves, Esc cancels.' }),
      el('span', { class: 'grow' }),
      el('button', { class: 'act quiet small', type: 'button', text: 'Cancel', 'data-cancel': '' }),
      el('button', { class: 'act go small', type: 'submit', text: 'Save' }),
    ]),
  ]);
  const cancel = () => void load();
  form.querySelector('[data-cancel]').addEventListener('click', cancel);
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void act(() => call('update_note', { id: note.id, title: title.value, body: body.value }));
  });
  queueMicrotask(() => body.focus());
  return form;
}

// --- the Notes, laid out as masonry --------------------------------------

/** The narrowest a column of Notes may be, and the gap between two. */
const NOTE_WIDTH = 280;
const NOTE_GAP = 12;

/** The Note cards last drawn, newest first, and how many columns hold them. */
let noteCards = [];
let noteColumns = 0;

/**
 * Put each Note, newest first, into the shortest column so far. A long Note
 * then pushes down only its own column, and the small Notes after it stay in
 * view instead of waiting under the tallest card of a row.
 */
function layNotes() {
  const list = byId('notes');
  const width = list.clientWidth;
  // A hidden tab has no width to measure; the observer below calls again
  // when the tab is shown.
  if (width === 0 || noteCards.length === 0) return;
  noteColumns = Math.max(1, Math.floor((width + NOTE_GAP) / (NOTE_WIDTH + NOTE_GAP)));
  const columns = Array.from({ length: noteColumns }, () => el('div', { class: 'notes-col' }));
  list.replaceChildren(...columns);
  for (const card of noteCards) {
    let shortest = columns[0];
    for (const column of columns) {
      if (column.offsetHeight < shortest.offsetHeight) shortest = column;
    }
    shortest.append(card);
  }
}

// Lay the Notes out again when the number of columns that fit changes, and
// when the Notes tab is first shown, since a hidden list measured nothing.
new ResizeObserver(() => {
  const width = byId('notes').clientWidth;
  const fits = Math.max(1, Math.floor((width + NOTE_GAP) / (NOTE_WIDTH + NOTE_GAP)));
  if (width > 0 && (fits !== noteColumns || !byId('notes').querySelector('.notes-col'))) {
    layNotes();
  }
}).observe(byId('notes'));

function drawNotes(notes) {
  byId('notes-count').textContent = notes.length > 0 ? String(notes.length) : '';
  noteCards = notes.map(noteCard);
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

/** The Meeting's two steps, drawn from what the Plugin Server holds now. */
async function drawMeeting() {
  const [view, preview] = await Promise.all([call('get_cycle'), call('meeting_markdown')]);
  byId('meeting-since').textContent =
    'This Cycle started ' + ago(view.cycle.startedAt) + ', ' + moment(view.cycle.startedAt) + '.';
  byId('meeting-md').textContent = preview.markdown;
}

/** Open the Meeting: when this Cycle began, and what would be copied. */
async function openMeeting() {
  try {
    await drawMeeting();
    byId('meeting-dialog').showModal();
    say(null);
  } catch (fault) {
    say(fault.message);
  }
}

byId('meeting').addEventListener('click', openMeeting);

// The dialog is the confirmation: its words say what starting a Cycle does.
async function startCycle() {
  const button = byId('start-cycle');
  button.disabled = true;
  try {
    const started = await call('start_cycle');
    notice(started.said);
    say(null);
    await Promise.all([load(), drawMeeting()]);
    byId('copy-meeting').focus();
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('start-cycle').addEventListener('click', startCycle);

// --- copying the Markdown for the Meeting -------------------------------

/**
 * Put text on the clipboard. The Clipboard API is there on the Host's own
 * address, which a browser counts as secure; the older copy command is the
 * fallback for a window that refuses it.
 */
async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const scratch = el('textarea', { class: 'visually-hidden', 'aria-hidden': 'true' });
    scratch.value = text;
    document.body.append(scratch);
    scratch.select();
    const copied = document.execCommand('copy');
    scratch.remove();
    if (!copied) throw new Error('This window would not let the page use the clipboard.');
  }
}

async function copyMeeting() {
  const button = byId('copy-meeting');
  button.disabled = true;
  try {
    const meeting = await call('meeting_markdown');
    // Exactly what the tool answered, byte for byte: the page adds nothing.
    await toClipboard(meeting.markdown);
    byId('meeting-md').textContent = meeting.markdown;
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy for the Meeting'), 2000);
    byId('start-cycle').focus();
    say(null);
  } catch (fault) {
    say(fault.message);
  } finally {
    button.disabled = false;
  }
}

byId('copy-meeting').addEventListener('click', copyMeeting);

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

// Whatever another page added — the Popup form, or another Plugin over the
// Tool Bus — shows here the next time this page is looked at.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void load();
});

void load();
