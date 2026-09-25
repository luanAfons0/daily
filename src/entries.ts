/**
 * An Entry: one thing you work on, with a Status, a title and an optional
 * Markdown body, and an optional Link. It belongs to exactly one Cycle at a
 * time.
 *
 * Every rule about where an Entry lives is kept here, in the write that
 * changes it, so that no caller — the Page, Scheduler or another Plugin — can
 * leave an Entry that is not `Done` outside the current Cycle.
 */
import { badInput } from './mcp.ts';
import { now, type Store } from './store.ts';

/** Where an Entry stands. Nothing else. */
export const STATUSES = ['Todo', 'In Progress', 'In Review', 'Done'] as const;

/** One of the four Statuses. */
export type Status = (typeof STATUSES)[number];

/** One Entry, as a caller sees it. */
export type Entry = {
  readonly id: number;
  readonly cycleId: number;
  readonly title: string;
  /** Markdown, or null when there is none. */
  readonly body: string | null;
  readonly status: Status;
  /** The address of the issue or pull request it is about, or null. */
  readonly link: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type EntryRow = {
  id: number;
  cycle_id: number;
  title: string;
  body: string | null;
  status: Status;
  link: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'id, cycle_id, title, body, status, link, created_at, updated_at';

function entryOf(row: EntryRow): Entry {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    title: row.title,
    body: row.body,
    status: row.status,
    link: row.link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every Entry in one Cycle, each column in the order the person set. */
export function entriesIn(store: Store, cycleId: number): Entry[] {
  const rows = store
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE cycle_id = ? ORDER BY position, id`)
    .all(cycleId) as EntryRow[];
  return rows.map(entryOf);
}

/** A place after every Entry there is, so what gets it goes to the end. */
function lastPosition(store: Store): number {
  const row = store.prepare('SELECT MAX(position) AS last FROM entries').get() as {
    last: number | null;
  };
  return (row.last ?? 0) + 1;
}

/** One Entry by its id, or a sentence that says there is none. */
export function entryById(store: Store, id: number): Entry {
  const row = store.prepare(`SELECT ${COLUMNS} FROM entries WHERE id = ?`).get(id) as
    | EntryRow
    | undefined;
  if (row === undefined) throw badInput(`No Entry has the id ${id}.`);
  return entryOf(row);
}

/** A new Entry, in the current Cycle and nowhere else. */
export function createEntry(
  store: Store,
  cycleId: number,
  fields: {
    readonly title: string;
    readonly body: string | null;
    readonly status: Status;
    readonly link: string | null;
  },
): Entry {
  const at = now();
  const done = store
    .prepare(
      'INSERT INTO entries ' +
        '(cycle_id, title, body, status, link, position, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      cycleId,
      fields.title,
      fields.body,
      fields.status,
      fields.link,
      lastPosition(store),
      at,
      at,
    );
  return entryById(store, Number(done.lastInsertRowid));
}

/** What a caller may change about an Entry: any of the four, at least one. */
export type EntryChange = {
  readonly title?: string;
  readonly body?: string | null;
  readonly status?: Status;
  /** A new Link, or null to take it away. */
  readonly link?: string | null;
};

/**
 * Change one Entry. Any Status may go to any other, so a mistake is always
 * one call away from being put right.
 *
 * An Entry that is not `Done` is always in the current Cycle. So a `Done`
 * Entry in an earlier Cycle that is set back to any other Status moves
 * into the current Cycle in this same write; the caller holds the transaction.
 * An Entry given a new Status goes to the end of its new column.
 */
export function updateEntry(
  store: Store,
  id: number,
  change: EntryChange,
  currentCycleId: () => number,
): Entry {
  const before = entryById(store, id);
  const after = {
    title: change.title ?? before.title,
    body: change.body === undefined ? before.body : change.body,
    status: change.status ?? before.status,
    link: change.link === undefined ? before.link : change.link,
  };
  const cycleId = after.status === 'Done' ? before.cycleId : currentCycleId();
  store
    .prepare(
      'UPDATE entries SET cycle_id = ?, title = ?, body = ?, status = ?, link = ?, ' +
        'updated_at = ? WHERE id = ?',
    )
    .run(cycleId, after.title, after.body, after.status, after.link, now(), id);
  if (after.status !== before.status) {
    store.prepare('UPDATE entries SET position = ? WHERE id = ?').run(lastPosition(store), id);
  }
  return entryById(store, id);
}

/**
 * Give one Entry a place in its column: above the Entry named by `before`, or
 * at the end when there is none. A Status, when given, first moves it into
 * that column, by the same rules as update_entry. The caller holds the
 * transaction.
 */
export function moveEntry(
  store: Store,
  id: number,
  place: { readonly status?: Status; readonly before: number | null },
  currentCycleId: () => number,
): Entry {
  const start = entryById(store, id);
  const moved =
    place.status === undefined || place.status === start.status
      ? start
      : updateEntry(store, id, { status: place.status }, currentCycleId);
  const others = entriesIn(store, moved.cycleId).filter(
    (entry) => entry.status === moved.status && entry.id !== id,
  );

  let at = others.length;
  if (place.before !== null) {
    at = others.findIndex((entry) => entry.id === place.before);
    if (at === -1) {
      throw badInput(
        `move_entry needs "before" to be another Entry in the same column: ` +
          `${moved.status}, in the same Cycle. ${place.before} is not one.`,
      );
    }
  }
  // The column is numbered again from the top, so no two places ever tie.
  const order = [...others.slice(0, at), moved, ...others.slice(at)];
  const placed = store.prepare('UPDATE entries SET position = ? WHERE id = ?');
  const base = lastPosition(store);
  order.forEach((entry, index) => placed.run(base + index, entry.id));
  return entryById(store, id);
}

/** Take one Entry away for good. It is gone from every Cycle. */
export function deleteEntry(store: Store, id: number): Entry {
  const gone = entryById(store, id);
  store.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return gone;
}

/** An Entry's id as given, or a sentence that says what an id is. */
export function checkId(tool: string, given: unknown): number {
  if (typeof given === 'number' && Number.isSafeInteger(given) && given > 0) return given;
  throw badInput(
    `${tool} needs "id": the number get_cycle gives each Entry, and was given ` +
      `${JSON.stringify(given) ?? 'nothing'}.`,
  );
}

/** A title as given, or a sentence that says what is wrong with it. */
export function checkTitle(tool: string, given: unknown): string {
  if (typeof given !== 'string' || given.trim() === '') {
    throw badInput(`${tool} needs a "title": the one line that says what the Entry is.`);
  }
  return given.trim();
}

/** A body as given: Markdown, or null for none. An empty body is none. */
export function checkBody(tool: string, given: unknown): string | null {
  if (given === undefined || given === null) return null;
  if (typeof given !== 'string') {
    throw badInput(`${tool} takes "body" as Markdown text, or leaves it out.`);
  }
  return given.trim() === '' ? null : given;
}

/** The longest Link kept. An address longer than this is not one a person pasted. */
const LINK_MAX = 2048;

/**
 * A Link as given: an absolute http: or https: address, trimmed, or null for
 * none. An empty Link is none. Any other scheme is refused, because the Page
 * opens the Link on a click, and a `javascript:` address there would run.
 */
export function checkLink(tool: string, given: unknown): string | null {
  if (given === undefined || given === null) return null;
  if (typeof given !== 'string') {
    throw badInput(`${tool} takes "link" as an http or https address, or leaves it out.`);
  }
  const link = given.trim();
  if (link === '') return null;
  if (link.length > LINK_MAX) {
    throw badInput(`${tool} takes a "link" of at most ${LINK_MAX} characters.`);
  }
  const address = URL.canParse(link) ? new URL(link) : null;
  if (
    address === null ||
    (address.protocol !== 'http:' && address.protocol !== 'https:') ||
    address.hostname === ''
  ) {
    throw badInput(
      `${tool} needs "link" as a whole http or https address, such as ` +
        `https://github.com/owner/repo/issues/1, and was given ${JSON.stringify(link)}.`,
    );
  }
  return link;
}

/** A Status as given, or a sentence that names the three there are. */
export function checkStatus(tool: string, given: unknown): Status {
  if (typeof given === 'string' && (STATUSES as readonly string[]).includes(given)) {
    return given as Status;
  }
  throw badInput(
    `${tool} needs "status" as one of "Todo", "In Progress", "In Review" or "Done", ` +
      `and was given ${JSON.stringify(given) ?? 'nothing'}.`,
  );
}
