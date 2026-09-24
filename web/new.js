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
const RINGS = { Todo: 'todo', 'In Progress': 'doing', Done: 'done' };

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

/** Fill the picker with New, then the Entries or the Notes there are. */
async function fillPicker() {
  const which = kind();
  const picker = byId('q-pick');
  picker.replaceChildren(new Option('New', ''));
  try {
    const items = await editable(which);
    if (kind() !== which) return;
    for (const [id, item] of items) {
      const label = which === 'entry' ? named(item) + ' · ' + item.status : named(item);
      picker.append(new Option('Edit: ' + label, id));
    }
  } catch (fault) {
    say(fault.message);
  }
}

/** The Entry or Note chosen to be edited, or undefined for a new one. */
function picked() {
  const items = kept[kind()];
  return items ? items.get(byId('q-pick').value) : undefined;
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
  void fillPicker();
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

byId('q-pick').addEventListener('change', pick);

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

// Enter saves from any field, the body too, so nothing here needs the mouse.
// Shift+Enter is still a new line in the body, for a Note of more than one.
byId('q-body').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) void save(event);
});

shape();
