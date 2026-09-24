/**
 * A Cycle: the time from one Meeting to the next, named by the moment it
 * started (ADR-0001).
 *
 * The current Cycle is the one that started last. There is always one: the
 * first starts by itself the first time anything needs it, so a fresh Plugin
 * directory works at once.
 */
import { entriesIn, type Entry } from './entries.ts';
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

/** The current Cycle and its Entries. */
export function viewOf(store: Store, cycle: Cycle): CycleView {
  const current = currentCycle(store);
  return {
    cycle: { ...cycle, current: cycle.id === current.id },
    entries: entriesIn(store, cycle.id),
  };
}
