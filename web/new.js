/* The Popup form: add an Entry or a Note, then leave. Vanilla JavaScript, no
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

/** Show the fields of an Entry, or only a body for a Note. */
function shape() {
  const note = kind() === 'note';
  const title = byId('q-title');
  const body = byId('q-body');
  title.hidden = note;
  byId('q-statuses').hidden = note;
  body.placeholder = note ? 'A Note, in Markdown.' : 'Details, in Markdown. Optional.';
  body.rows = note ? 6 : 3;
  (note ? body : title).focus();
  say(null);
}

async function save(event) {
  if (event) event.preventDefault();
  const button = byId('q-save');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (kind() === 'note') {
      await call('create_note', { body: byId('q-body').value });
    } else {
      await call('create_entry', {
        title: byId('q-title').value,
        body: byId('q-body').value,
        status: status(),
      });
    }
    location.assign('./');
  } catch (fault) {
    say(fault.message);
    button.disabled = false;
  }
}

for (const choice of document.querySelectorAll('input[name="kind"]')) {
  choice.addEventListener('change', shape);
}

byId('quick').addEventListener('submit', save);

// Enter saves from any field, the body too, so nothing here needs the mouse.
// Shift+Enter is still a new line in the body, for a Note of more than one.
byId('q-body').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) void save(event);
});

shape();
