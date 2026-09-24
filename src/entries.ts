/**
 * An Entry: one thing you work on, with a Status, a title and an optional
 * Markdown body. It belongs to exactly one Cycle at a time.
 *
 * Every rule about where an Entry lives is kept here, in the write that
 * changes it, so that no caller — the Page, Scheduler or another Plugin — can
 * leave an Entry that is not `Done` outside the current Cycle.
 */
import { badInput } from './mcp.ts';
import { now, type Store } from './store.ts';

/** Where an Entry stands. Nothing else. */
export const STATUSES = ['Todo', 'In Progress', 'Done'] as const;

/** One of the three Statuses. */
export type Status = (typeof STATUSES)[number];

/** One Entry, as a caller sees it. */
export type Entry = {
  readonly id: number;
  readonly cycleId: number;
  readonly title: string;
  /** Markdown, or null when there is none. */
  readonly body: string | null;
  readonly status: Status;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type EntryRow = {
  id: number;
  cycle_id: number;
  title: string;
  body: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'id, cycle_id, title, body, status, created_at, updated_at';

function entryOf(row: EntryRow): Entry {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every Entry in one Cycle, oldest first. */
export function entriesIn(store: Store, cycleId: number): Entry[] {
  const rows = store
    .prepare(`SELECT ${COLUMNS} FROM entries WHERE cycle_id = ? ORDER BY id`)
    .all(cycleId) as EntryRow[];
  return rows.map(entryOf);
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
  fields: { readonly title: string; readonly body: string | null; readonly status: Status },
): Entry {
  const at = now();
  const done = store
    .prepare(
      'INSERT INTO entries (cycle_id, title, body, status, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(cycleId, fields.title, fields.body, fields.status, at, at);
  return entryById(store, Number(done.lastInsertRowid));
}

/** What a caller may change about an Entry: any of the three, at least one. */
export type EntryChange = {
  readonly title?: string;
  readonly body?: string | null;
  readonly status?: Status;
};

/**
 * Change one Entry. Any Status may go to any other, so a mistake is always
 * one call away from being put right.
 *
 * An Entry that is not `Done` is always in the current Cycle. So a `Done`
 * Entry in an earlier Cycle that is set back to `Todo` or `In Progress` moves
 * into the current Cycle in this same write; the caller holds the transaction.
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
  };
  const cycleId = after.status === 'Done' ? before.cycleId : currentCycleId();
  store
    .prepare(
      'UPDATE entries SET cycle_id = ?, title = ?, body = ?, status = ?, updated_at = ? ' +
        'WHERE id = ?',
    )
    .run(cycleId, after.title, after.body, after.status, now(), id);
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

/** A Status as given, or a sentence that names the three there are. */
export function checkStatus(tool: string, given: unknown): Status {
  if (typeof given === 'string' && (STATUSES as readonly string[]).includes(given)) {
    return given as Status;
  }
  throw badInput(
    `${tool} needs "status" as one of "Todo", "In Progress" or "Done", ` +
      `and was given ${JSON.stringify(given) ?? 'nothing'}.`,
  );
}
