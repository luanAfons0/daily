/* The Popup form: add an Entry or a Note, or edit one already there, then
   leave. Vanilla JavaScript, no
   build step, and every call through call() in rpc.js.

   Leaving is the point. After a save the page goes to the main Plugin Page,
   './'. In a FirstMate Popup that leaves the address the Shortcut is bound
   to, so the Popup hides; in a normal browser it lands on the main page,
   which shows what was just added. */
'use strict';

const byId = (id) => document.getElementById(id);

function kind() {
  const chosen = document.querySelector('input[name="kind"]:checked');
  return chosen ? chosen.value : 'entry';
}

function status() {
  const chosen = document.querySelector('input[name="status"]:checked');
  return chosen ? chosen.value : 'Todo';
}

function say(text) {
  const banner = byId('q-banner');
  banner.textContent = text || '';
  banner.hidden = !text;
}

/** The ring before the title wears the Status chosen, as the board does. */
const RINGS = { Todo: 'todo', 'In Progress': 'doing', 'In Review': 'review', Done: 'done' };

function ring() {
  byId('q-ring').className = 'ring ' + RINGS[status()];
}

/**
 * Close the Popup without saving. Leaving for the main Plugin Page is what
 * hides the Popup after a save too, so closing is the same move.
 */
function close() {
  location.assign('./');
}

// --- choosing one to edit -------------------------------------------------

/** What the picker offers for each kind: the tool that lists it, and how. */
const LISTS = {
  entry: { tool: 'get_cycle', items: (answer) => answer.entries },
  note: { tool: 'list_notes', items: (answer) => answer.notes },
};

/** The Entries of the current Cycle and the Notes, once asked for, by id. */
const kept = { entry: null, note: null };

/** A name for the list: the title, or else the first line of the text. */
function named(item) {
  const text = item.body || '';
  const line = item.title || text.split('\n').find((part) => part.trim() !== '') || '';
  // Markdown marks are for the page that formats them; a list shows words.
  const plain = line.replace(/^[#>*\-+\s]+/, '').replace(/[*_`~]/g, '').trim();
  return plain.length > 60 ? plain.slice(0, 59) + '…' : plain;
}

/** Ask once for what this kind can edit: the current Cycle, or the Notes. */
async function editable(which) {
  if (kept[which] === null) {
    const answer = await call(LISTS[which].tool);
    kept[which] = new Map(LISTS[which].items(answer).map((item) => [String(item.id), item]));
  }
  return kept[which];
}

// --- the picker: New, or one already there ---------------------------------

/** The Statuses, in the order the board stands, and the ring each wears. */
const ORDER = ['Todo', 'In Progress', 'In Review', 'Done'];

/** The id of the one chosen to be edited, or '' for a new one. */
let pickedId = '';
/** The rows the menu shows now, and the one the keys are on. */
let rows = [];
let active = 0;

/** Text as a find compares it: no case, no accents, so "migracao" finds "Migração". */
function plain(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** The Entry or Note chosen to be edited, or undefined for a new one. */
function picked() {
  const items = kept[kind()];
  return items && pickedId ? items.get(pickedId) : undefined;
}

/** One row of the menu: a ring for an Entry, then its name. */
function row(label, value, dot) {
  const node = document.createElement('div');
  node.className = 'pick-row';
  node.id = 'q-row-' + (value || 'new');
  node.setAttribute('role', 'option');
  node.dataset.value = value;
  if (dot !== null) {
    const mark = document.createElement('i');
    mark.className = dot ? 'ring ' + dot : 'pick-plus';
    node.append(mark);
  }
  const text = document.createElement('span');
  text.textContent = label;
  node.append(text);
  node.addEventListener('mousedown', (event) => event.preventDefault());
  node.addEventListener('click', () => choose(value));
  return node;
}

/** Draw the menu for what is typed in the find field. */
async function drawMenu() {
  const which = kind();
  const list = byId('q-list');
  const wanted = plain(byId('q-find').value.trim());
  let items;
  try {
    items = await editable(which);
  } catch (fault) {
    say(fault.message);
    return;
  }
  if (kind() !== which) return;

  const found = [...items.values()].filter((item) => plain(named(item)).includes(wanted));
  const nodes = [row(which === 'note' ? 'New Note' : 'New Entry', '', '')];
  if (which === 'note') {
    nodes.push(...found.map((item) => row(named(item), String(item.id), null)));
  } else {
    for (const status of ORDER) {
      const mine = found.filter((item) => item.status === status);
      if (mine.length === 0) continue;
      const heading = document.createElement('p');
      heading.className = 'pick-group';
      heading.textContent = status;
      nodes.push(heading);
      nodes.push(...mine.map((item) => row(named(item), String(item.id), RINGS[status])));
    }
  }
  if (found.length === 0 && wanted) {
    const none = document.createElement('p');
    none.className = 'pick-none';
    none.textContent = 'Nothing matches “' + byId('q-find').value.trim() + '”.';
    nodes.push(none);
  }
  list.replaceChildren(...nodes);
  rows = [...list.querySelectorAll('.pick-row')];
  // With something typed, the first match is the likely one; with nothing,
  // the one already chosen.
  const current = rows.findIndex((node) => node.dataset.value === pickedId);
  active = wanted && rows.length > 1 ? 1 : Math.max(0, current);
  light();
}

/** Mark the row the keys are on, and keep it in view. */
function light() {
  rows.forEach((node, index) => node.setAttribute('aria-selected', String(index === active)));
  const on = rows[active];
  if (!on) return;
  byId('q-find').setAttribute('aria-activedescendant', on.id);
  on.scrollIntoView({ block: 'nearest' });
}

function menuOpen() {
  return !byId('q-menu').hidden;
}

function openMenu() {
  byId('q-menu').hidden = false;
  byId('q-pick').setAttribute('aria-expanded', 'true');
  byId('q-find').value = '';
  byId('q-find').focus();
  void drawMenu();
}

function shutMenu() {
  byId('q-menu').hidden = true;
  byId('q-pick').setAttribute('aria-expanded', 'false');
}

/** Choose New, or one to edit: fill the fields, and name it on the button. */
function choose(value) {
  pickedId = value;
  shutMenu();
  const item = picked();
  const button = byId('q-pick');
  button.replaceChildren();
  if (item && kind() === 'entry') {
    const mark = document.createElement('i');
    mark.className = 'ring ' + RINGS[item.status];
    button.append(mark);
  }
  const name = document.createElement('span');
  name.className = 'pick-name';
  name.textContent = item ? named(item) : 'New';
  button.append(name);
  pick();
}

function saveLabel() {
  if (picked()) return 'Save changes';
  return kind() === 'note' ? 'Save Note' : 'Save Entry';
}

/** Put the chosen one's title, text and Status in the fields, or empty them. */
function pick() {
  const item = picked();
  byId('q-title').value = item ? item.title : '';
  byId('q-body').value = item ? item.body || '' : '';
  if (kind() === 'entry') {
    const wanted = item ? item.status : 'Todo';
    for (const choice of document.querySelectorAll('input[name="status"]')) {
      choice.checked = choice.value === wanted;
    }
    ring();
  }
  byId('q-save').textContent = saveLabel();
  (item ? byId('q-body') : byId('q-title')).focus();
  say(null);
}

/** Show the fields of an Entry, or of a Note: a title and a body, no Status. */
function shape() {
  const note = kind() === 'note';
  const title = byId('q-title');
  const body = byId('q-body');
  byId('q-ring').hidden = note;
  byId('q-statuses').hidden = note;
  title.placeholder = note ? 'Title' : 'What are you working on?';
  body.placeholder = note ? 'The Note, in Markdown…' : 'Add details, in Markdown…';
  // A new kind starts new: what was being edited belongs to the other kind.
  title.value = '';
  body.value = '';
  byId('q-save').textContent = note ? 'Save Note' : 'Save Entry';
  title.focus();
  say(null);
  pickedId = '';
  const name = document.createElement('span');
  name.className = 'pick-name';
  name.textContent = 'New';
  byId('q-pick').replaceChildren(name);
  shutMenu();
}

async function save(event) {
  if (event) event.preventDefault();
  const button = byId('q-save');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const item = picked();
    if (item && kind() === 'note') {
      await call('update_note', {
        id: item.id,
        title: byId('q-title').value,
        body: byId('q-body').value,
      });
    } else if (item) {
      await call('update_entry', {
        id: item.id,
        title: byId('q-title').value,
        body: byId('q-body').value,
        status: status(),
      });
    } else if (kind() === 'note') {
      await call('create_note', { title: byId('q-title').value, body: byId('q-body').value });
    } else {
      await call('create_entry', {
        title: byId('q-title').value,
        body: byId('q-body').value,
        status: status(),
      });
    }
    // Tell the main Plugin Page, which may be open under this Popup, to draw
    // what was just saved.
    new BroadcastChannel('daily').postMessage('saved');
    location.assign('./');
  } catch (fault) {
    say(fault.message);
    button.disabled = false;
  }
}

for (const choice of document.querySelectorAll('input[name="kind"]')) {
  choice.addEventListener('change', shape);
}

for (const choice of document.querySelectorAll('input[name="status"]')) {
  choice.addEventListener('change', ring);
}

byId('q-pick').addEventListener('click', () => (menuOpen() ? shutMenu() : openMenu()));
byId('q-find').addEventListener('input', () => void drawMenu());

// The menu's own keys: up and down move, Enter chooses, Esc shuts only the
// menu, and Tab leaves it.
byId('q-find').addEventListener('keydown', (event) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step) {
    event.preventDefault();
    active = (active + step + rows.length) % rows.length;
    light();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (rows[active]) choose(rows[active].dataset.value);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    shutMenu();
    byId('q-pick').focus();
  } else if (event.key === 'Tab') {
    shutMenu();
  }
});

// A click anywhere else shuts the menu.
document.addEventListener('mousedown', (event) => {
  if (menuOpen() && !event.target.closest('.picker')) shutMenu();
});

// For a Note, Enter in the title goes on to the text, which a Note cannot be
// kept without. For an Entry, Enter saves from the title as from anywhere.
byId('q-title').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || kind() !== 'note') return;
  event.preventDefault();
  byId('q-body').focus();
});

byId('quick').addEventListener('submit', save);
byId('q-close').addEventListener('click', close);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close();
});

// The same keys as the Plugin Page: Shift+Enter saves from any field, and
// Enter alone is a new line in the text, which is Markdown and has many.
for (const field of [byId('q-title'), byId('q-body')]) {
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey && !event.isComposing) void save(event);
  });
}

shape();
