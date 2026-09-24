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

// --- time -----------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Tue 23 Sep 10:00, on this machine's clock: how a Cycle is named. */
function moment(at) {
  const when = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    WEEKDAYS[when.getDay()] + ' ' + when.getDate() + ' ' + MONTHS[when.getMonth()] + ' ' +
    pad(when.getHours()) + ':' + pad(when.getMinutes())
  );
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

function entryCard(entry) {
  const edit = el('button', { class: 'act quiet small', type: 'button', text: 'Edit' });
  const remove = el('button', { class: 'act quiet small danger', type: 'button', text: 'Delete' });
  const card = el('article', { class: 'card entry' }, [
    el('p', { class: 'entry-title', text: entry.title }),
    entry.body ? formatted(entry.body, 'entry-body') : null,
    el('div', { class: 'entry-foot' }, [
      statusPicker(entry),
      el('span', { class: 'grow' }),
      edit,
      remove,
    ]),
  ]);
  edit.addEventListener('click', () => card.replaceWith(entryEditor(entry)));
  remove.addEventListener('click', () => {
    if (!confirm('Delete “' + entry.title + '” for good?')) return;
    void act(() => call('delete_entry', { id: entry.id }));
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

function column(status, entries) {
  const mine = entries.filter((entry) => entry.status === status.name);
  return el('section', { class: 'column', 'aria-label': status.name }, [
    el('div', { class: 'column-hd' }, [
      el('i', { class: 'dot ' + status.dot }),
      status.name,
      el('span', { class: 'count', text: String(mine.length) }),
    ]),
    ...(mine.length === 0
      ? [el('p', { class: 'column-empty', text: 'Nothing here.' })]
      : mine.map(entryCard)),
  ]);
}

function drawCycle(view) {
  const since = byId('since');
  since.replaceChildren('Cycle since ', el('b', { text: moment(view.cycle.startedAt) }));

  const count = view.entries.length;
  byId('cycle-count').textContent = count === 1 ? '1 Entry' : count + ' Entries';
  byId('board').replaceChildren(...STATUSES.map((status) => column(status, view.entries)));
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

function earlierCycle(cycle) {
  const body = el('div', { class: 'earlier-body' });
  const item = el('details', { class: 'card earlier-cycle', open: opened.has(cycle.id) }, [
    el('summary', {}, [
      el('span', { class: 'earlier-name', text: moment(cycle.startedAt) }),
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

function drawEarlier(cycles) {
  const earlier = cycles.filter((cycle) => !cycle.current);
  byId('earlier').replaceChildren(
    ...(earlier.length === 0
      ? [el('p', { class: 'notes-empty', text: 'This is the first Cycle.' })]
      : earlier.map(earlierCycle)),
  );
}

// --- the Notes ------------------------------------------------------------

function noteCard(note) {
  const edit = el('button', { class: 'act quiet small', type: 'button', text: 'Edit' });
  const remove = el('button', { class: 'act quiet small danger', type: 'button', text: 'Delete' });
  const card = el('article', { class: 'card note' }, [
    formatted(note.body, 'note-body'),
    el('div', { class: 'entry-foot' }, [
      el('time', { class: 'hint', datetime: note.createdAt, text: moment(note.createdAt) }),
      el('span', { class: 'grow' }),
      edit,
      remove,
    ]),
  ]);
  edit.addEventListener('click', () => card.replaceWith(noteEditor(note)));
  remove.addEventListener('click', () => {
    if (!confirm('Delete this Note for good?')) return;
    void act(() => call('delete_note', { id: note.id }));
  });
  return card;
}

/** The same Note, open for its body to be edited in place. */
function noteEditor(note) {
  const body = el('textarea', { class: 'input', rows: '5', 'aria-label': 'Note' });
  body.value = note.body;
  const form = el('form', { class: 'card note editing' }, [
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
    void act(() => call('update_note', { id: note.id, body: body.value }));
  });
  queueMicrotask(() => body.focus());
  return form;
}

function drawNotes(notes) {
  const list = byId('notes');
  if (notes.length === 0) {
    list.replaceChildren(el('p', { class: 'notes-empty', text: 'No Notes yet.' }));
    return;
  }
  list.replaceChildren(...notes.map(noteCard));
}

async function keepNote(event) {
  event.preventDefault();
  const body = byId('n-body');
  const button = byId('n-add');
  button.disabled = true;
  try {
    await call('create_note', { body: body.value });
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

async function startCycle() {
  const ok = confirm(
    'Start a new Cycle now? Every Entry that is Todo or In Progress moves into it. ' +
      'Done Entries stay in this Cycle.',
  );
  if (!ok) return;
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
    notice('Copied the Markdown for the Meeting.');
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

// Whatever another page added — the Popup form, or another Plugin over the
// Tool Bus — shows here the next time this page is looked at.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void load();
});

void load();
