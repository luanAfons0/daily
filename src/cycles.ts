/**
 * A Cycle: the time from one Meeting to the next, named by the moment it
 * started (ADR-0001).
 *
 * The current Cycle is the one that started last. There is always one: the
 * first starts by itself the first time anything needs it, so a fresh Plugin
 * directory works at once.
 */
import { entriesIn, type Entry, type Status } from './entries.ts';
import { badInput } from './mcp.ts';
import { now, type Store } from './store.ts';

/** One Cycle, as the Store keeps it. */
export type Cycle = {
  readonly id: number;
  /** The moment it started, as ISO 8601. It is also its name. */
  readonly startedAt: string;
};

/** One Cycle with its Entries, which is what the Page draws. */
export type CycleView = {
  readonly cycle: Cycle & { readonly current: boolean };
  readonly entries: readonly Entry[];
};

type CycleRow = { id: number; started_at: string };

function cycleOf(row: CycleRow): Cycle {
  return { id: row.id, startedAt: row.started_at };
}

/**
 * The Cycle that started last, or the first one, started now. The order is by
 * id rather than by moment, so two Cycles started in the same millisecond
 * still have a last one.
 */
export function currentCycle(store: Store): Cycle {
  const row = store.prepare('SELECT id, started_at FROM cycles ORDER BY id DESC LIMIT 1').get() as
    | CycleRow
    | undefined;
  return row === undefined ? addCycle(store) : cycleOf(row);
}

/** One more Cycle, started now. It moves nothing by itself. */
export function addCycle(store: Store): Cycle {
  const startedAt = now();
  const done = store.prepare('INSERT INTO cycles (started_at) VALUES (?)').run(startedAt);
  return { id: Number(done.lastInsertRowid), startedAt };
}

/** One Cycle by its id, or a sentence that says there is none. */
export function cycleById(store: Store, id: number): Cycle {
  const row = store.prepare('SELECT id, started_at FROM cycles WHERE id = ?').get(id) as
    | CycleRow
    | undefined;
  if (row === undefined) throw badInput(`No Cycle has the id ${id}. list_cycles names them all.`);
  return cycleOf(row);
}

/** One Cycle in the list: its name, and how many of its Entries stand where. */
export type CycleSummary = Cycle & {
  readonly current: boolean;
  readonly counts: { readonly [status in Status]: number };
};

/** Every Cycle there ever was, newest first, with its Entries counted by Status. */
export function listCycles(store: Store): CycleSummary[] {
  const current = currentCycle(store);
  const rows = store
    .prepare(
      `SELECT c.id, c.started_at,
              SUM(e.status = 'Todo') AS todo,
              SUM(e.status = 'In Progress') AS doing,
              SUM(e.status = 'Done') AS done
         FROM cycles c LEFT JOIN entries e ON e.cycle_id = c.id
        GROUP BY c.id
        ORDER BY c.id DESC`,
    )
    .all() as (CycleRow & { todo: number | null; doing: number | null; done: number | null })[];
  return rows.map((row) => ({
    ...cycleOf(row),
    current: row.id === current.id,
    counts: { Todo: row.todo ?? 0, 'In Progress': row.doing ?? 0, Done: row.done ?? 0 },
  }));
}

/** What starting a Cycle did: the new Cycle, and how many Entries moved into it. */
export type Started = {
  readonly cycle: Cycle;
  readonly moved: number;
};

/**
 * Start a Cycle, and move every Entry that is not `Done` into it with its
 * Status unchanged. It is the same Entry, moved, never a copy, and a `Done`
 * Entry stays in the Cycle it was done in. Every call starts one Cycle; it
 * never decides to do nothing (ADR-0001). The caller holds the transaction,
 * so the new Cycle and the move land together or not at all.
 */
export function startCycle(store: Store): Started {
  // The first Cycle, if there is none yet, is started first: an Entry can only
  // be moved out of a Cycle it is in.
  currentCycle(store);
  const cycle = addCycle(store);
  const done = store
    .prepare("UPDATE entries SET cycle_id = ? WHERE status <> 'Done' AND cycle_id <> ?")
    .run(cycle.id, cycle.id);
  return { cycle, moved: Number(done.changes) };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A Cycle's name: the moment it started, on this machine's clock, as
 * "Tue 23 Sep 10:00".
 */
export function nameOf(cycle: Cycle): string {
  const at = new Date(cycle.startedAt);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}

/**
 * What starting a Cycle did, in one sentence. A Scheduler Run keeps one
 * sentence of the answer, so this is the whole of what the text says.
 */
export function saidOf(started: Started): string {
  const moved =
    started.moved === 0
      ? 'moved no Entries'
      : started.moved === 1
        ? 'moved 1 Entry'
        : `moved ${started.moved} Entries`;
  return `Started the Cycle of ${nameOf(started.cycle)} and ${moved} into it.`;
}

/** One Cycle and its Entries, and whether it is the current one. */
export function viewOf(store: Store, cycle: Cycle): CycleView {
  const current = currentCycle(store);
  return {
    cycle: { ...cycle, current: cycle.id === current.id },
    entries: entriesIn(store, cycle.id),
  };
}
