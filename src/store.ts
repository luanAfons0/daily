/**
 * The one SQLite file, `daily.db`, where every Cycle, Entry and Note lives
 * (ADR-0002).
 *
 * The file is in the Plugin's own directory, which is where the Host starts
 * the Plugin Server, so it is one relative path away. Its schema version is
 * `PRAGMA user_version`: opening an older file moves it up to the current
 * version, one step at a time, and a newer file than this code knows is
 * refused rather than guessed at.
 */
import { DatabaseSync } from 'node:sqlite';

/** Where the data lives, relative to the Plugin directory. */
export const FILE = 'daily.db';

/** The Store: one open connection to `daily.db`. */
export type Store = DatabaseSync;

/**
 * Each step moves the file up one version. A step is never edited once it
 * has shipped; a change to the schema is a new step at the end.
 */
const STEPS: readonly string[] = [
  `
  CREATE TABLE cycles (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL
  );
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    cycle_id INTEGER NOT NULL REFERENCES cycles (id),
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL CHECK (status IN ('Todo', 'In Progress', 'Done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX entries_by_cycle ON entries (cycle_id);
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

/** Open `daily.db`, and bring it up to the current version. */
export function openStore(path: string = FILE): Store {
  const store = new DatabaseSync(path);
  store.exec('PRAGMA foreign_keys = ON');
  const row = store.prepare('PRAGMA user_version').get() as { user_version: number };
  const version = row.user_version;
  if (version > STEPS.length) {
    throw new Error(
      `${path} is at schema version ${version}, and this Daily knows only up to ` +
        `${STEPS.length}. Run a newer Daily, or restore an older copy of the file.`,
    );
  }
  for (let step = version; step < STEPS.length; step += 1) {
    within(store, () => {
      store.exec(STEPS[step] ?? '');
      store.exec(`PRAGMA user_version = ${step + 1}`);
    });
  }
  return store;
}

/** Do this work in one transaction: all of it lands, or none of it does. */
export function within<T>(store: Store, work: () => T): T {
  store.exec('BEGIN IMMEDIATE');
  try {
    const done = work();
    store.exec('COMMIT');
    return done;
  } catch (fault) {
    store.exec('ROLLBACK');
    throw fault;
  }
}

/** Now, as the Store writes a moment. */
export function now(): string {
  return new Date().toISOString();
}
