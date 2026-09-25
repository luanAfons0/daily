/**
 * The one SQLite file, `worklog.db`, where every Cycle, Entry and Note lives
 * (ADR-0002).
 *
 * The file is in the Plugin's own directory, which is where the Host starts
 * the Plugin Server, so it is one relative path away. Its schema version is
 * `PRAGMA user_version`: opening an older file moves it up to the current
 * version, one step at a time, and a newer file than this code knows is
 * refused rather than guessed at.
 *
 * Before the Plugin was called Worklog, the file was `daily.db`. A directory
 * from then still holds it, and start-up renames it before it opens anything.
 */
import { existsSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** Where the data lives, relative to the Plugin directory. */
export const FILE = 'worklog.db';

/** Where the data lived before the Plugin was called Worklog. */
const OLD_FILE = 'daily.db';

/** The files SQLite keeps beside the data file, each named after it. */
const BESIDE: readonly string[] = ['', '-wal', '-shm', '-journal'];

/** The Store: one open connection to `worklog.db`. */
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
  // A Note may have a title of its own. The Notes kept before this step have
  // none; their text is left exactly as it was.
  `
  ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT '';
  `,
  // An Entry has a place in its column, which the person sets. Every Entry
  // there already was keeps the order it had, oldest first.
  `
  ALTER TABLE entries ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  UPDATE entries SET position = id;
  `,
  // In Review is a fourth Status. SQLite cannot change a CHECK in place, so
  // the table is built again with the new one and every row copied across,
  // ids, places and all. Nothing refers to an Entry, so nothing else moves.
  `
  CREATE TABLE entries_next (
    id INTEGER PRIMARY KEY,
    cycle_id INTEGER NOT NULL REFERENCES cycles (id),
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL CHECK (status IN ('Todo', 'In Progress', 'In Review', 'Done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO entries_next (id, cycle_id, title, body, status, created_at, updated_at, position)
    SELECT id, cycle_id, title, body, status, created_at, updated_at, position FROM entries;
  DROP TABLE entries;
  ALTER TABLE entries_next RENAME TO entries;
  CREATE INDEX entries_by_cycle ON entries (cycle_id);
  `,
];

/**
 * Rename an old `daily.db`, and each file beside it, to `worklog.db`.
 *
 * It is a rename, never a copy, so no stale second copy of anyone's Notes is
 * left on disk. The content does not change, which is why this is not one of
 * the STEPS. When `worklog.db` is there already, it is the data, and both files
 * are left alone.
 */
export function renameOldFile(): void {
  if (existsSync(FILE) || !existsSync(OLD_FILE)) return;
  // The data file goes last: until it moves, a start that fails halfway
  // through finds it where it was and tries again.
  for (const suffix of [...BESIDE].reverse()) {
    if (existsSync(OLD_FILE + suffix)) renameSync(OLD_FILE + suffix, FILE + suffix);
  }
}

/** Open `worklog.db`, and bring it up to the current version. */
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
