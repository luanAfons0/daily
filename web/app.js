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
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value);
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

function entryCard(entry) {
  return el('article', { class: 'card entry' }, [
    el('p', { class: 'entry-title', text: entry.title }),
    entry.body ? el('div', { class: 'entry-body', text: entry.body }) : null,
  ]);
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
    drawCycle(await call('get_cycle'));
    say(null);
  } catch (fault) {
    say(fault.message);
  }
}

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
