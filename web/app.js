/* The Daily Plugin Page. Vanilla JavaScript, no build step and no framework,
   talking to one same-origin address. Everything it shows it learned by
   asking its own Plugin Server; it assumes nothing, and it keeps no data of
   its own. */
'use strict';

// The one address this page talks to: its own Plugin's tools, relative to
// the address the Host serves this page from. FirstMate admits the page with
// a cookie it set on the first navigation, so nothing here carries a token and
// no address is built by hand (FirstMate ADR-0003).
const RPC = 'rpc';

// What the Host answers when it cannot reach the Plugin Server at all. An
// empty page would leave either one a mystery, so each becomes a sentence.
const STOPPED = 503;
const NO_PLUGIN_SERVER = 501;

/** The three Statuses, in the order the columns stand. */
const STATUSES = [
  { name: 'Todo', dot: 'todo' },
  { name: 'In Progress', dot: 'doing' },
  { name: 'Done', dot: 'done' },
];

let counter = 0;

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

/** One tool call on this Plugin's own Plugin Server. */
async function call(name, args) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: (counter += 1),
      method: 'tools/call',
      params: { name: name, arguments: args || {} },
    }),
  });

  if (response.status === STOPPED) {
    throw new Error(
      'Daily’s Plugin Server is Stopped. The reason is in the journal: ' +
        'journalctl --user -u firstmate -f. The Host never starts it again on its own, ' +
        'so restart the Host once it is fixed.',
    );
  }
  if (response.status === NO_PLUGIN_SERVER) {
    throw new Error('The Host found no Plugin Server for Daily, so it has nothing to show.');
  }
  if (!response.ok) {
    throw new Error('The Host answered ' + response.status + ' for this call.');
  }

  const answered = await response.json();
  if (answered.error) throw new Error(answered.error.message);
  return answered.result.structuredContent;
}

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
    const [view, listed] = await Promise.all([call('get_cycle'), call('list_notes')]);
    drawCycle(view);
    drawNotes(listed.notes);
    say(null);
  } catch (fault) {
    say(fault.message);
  }
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
