/**
 * The data file is `worklog.db`. A Plugin directory from before the rename
 * holds `daily.db`, and the first start renames it, with every file SQLite
 * keeps beside it, so that no Cycle, Entry or Note is lost (ADR-0002).
 */
import { strict as assert } from 'node:assert';
import { copyFile, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import {
  makeDirectory,
  startedAndShaken,
  structureOf,
  type CycleView,
  type Note,
} from './helpers/plugin.ts';

type Listed = { readonly cycles: readonly { readonly id: number }[] };

/**
 * A Plugin directory as it was before the rename: a `daily.db` with Entries
 * in two Cycles and two Notes, made by the real Plugin Server.
 */
async function oldDirectory(t: TestContext): Promise<string> {
  const plugin = await startedAndShaken(t);
  await plugin.call('create_entry', { title: 'finished', status: 'Done' });
  await plugin.call('start_cycle');
  await plugin.call('create_entry', { title: 'carried', status: 'In Progress' });
  await plugin.call('create_note', { title: 'one', body: 'first' });
  await plugin.call('create_note', { title: 'two', body: 'second' });
  plugin.stop();
  await plugin.ended();
  await rename(join(plugin.directory, 'worklog.db'), join(plugin.directory, 'daily.db'));
  return plugin.directory;
}

/** What a person sees of their data: every Cycle's Entries, and every Note. */
async function everything(t: TestContext, directory: string) {
  const plugin = await startedAndShaken(t, { directory });
  const listed = structureOf<Listed>(await plugin.call('list_cycles'));
  const entries: string[] = [];
  for (const cycle of listed.cycles) {
    const view = structureOf<CycleView>(await plugin.call('get_cycle', { id: cycle.id }));
    entries.push(...view.entries.map((entry) => `${entry.title}: ${entry.status}`));
  }
  const notes = structureOf<{ notes: readonly Note[] }>(await plugin.call('list_notes'));
  plugin.stop();
  await plugin.ended();
  return { cycles: listed.cycles.length, entries, notes: notes.notes.map((note) => note.body) };
}

test('a directory holding only daily.db starts with every Cycle, Entry and Note', async (t) => {
  const directory = await oldDirectory(t);

  const seen = await everything(t, directory);

  assert.deepEqual(seen, {
    cycles: 2,
    entries: ['carried: In Progress', 'finished: Done'],
    notes: ['second', 'first'],
  });
  const files = await readdir(directory);
  assert.ok(files.includes('worklog.db'), `the directory holds ${files.join(', ')}`);
  assert.ok(!files.some((file) => file.startsWith('daily.db')), `still: ${files.join(', ')}`);
});

test('the write-ahead files beside daily.db are renamed with it', async (t) => {
  const source = await makeDirectory(t);
  const directory = await makeDirectory(t);
  const old = new DatabaseSync(join(source, 'daily.db'));
  old.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE cycles (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL);
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY, cycle_id INTEGER NOT NULL REFERENCES cycles (id),
      title TEXT NOT NULL, body TEXT,
      status TEXT NOT NULL CHECK (status IN ('Todo', 'In Progress', 'In Review', 'Done')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX entries_by_cycle ON entries (cycle_id);
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY, body TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT ''
    );
    PRAGMA user_version = 4;
    INSERT INTO cycles (started_at) VALUES ('2026-09-24T10:00:00.000Z');
    INSERT INTO entries (cycle_id, title, status, created_at, updated_at, position)
      VALUES (1, 'only in the log', 'Todo', '2026-09-24T10:00:00.000Z',
              '2026-09-24T10:00:00.000Z', 1);
  `);
  // Copied while the connection is open, so the Entry is still in the -wal
  // file and not yet in daily.db: it is there after start-up only if the -wal
  // file moved too.
  for (const file of ['daily.db', 'daily.db-wal', 'daily.db-shm']) {
    await copyFile(join(source, file), join(directory, file));
  }
  old.close();

  const seen = await everything(t, directory);

  assert.deepEqual(seen.entries, ['only in the log: Todo']);
  const files = await readdir(directory);
  assert.ok(!files.some((file) => file.startsWith('daily.db')), `still: ${files.join(', ')}`);
});

test('a rollback journal beside daily.db is renamed with it', async (t) => {
  const directory = await oldDirectory(t);
  // An empty journal is not a hot one, so SQLite opens the file as it is.
  await writeFile(join(directory, 'daily.db-journal'), '');

  const seen = await everything(t, directory);

  assert.equal(seen.cycles, 2);
  const files = await readdir(directory);
  assert.ok(!files.some((file) => file.startsWith('daily.db')), `still: ${files.join(', ')}`);
});

test('a directory holding both files keeps both untouched and reads worklog.db', async (t) => {
  const directory = await oldDirectory(t);
  const fresh = await startedAndShaken(t);
  fresh.stop();
  await fresh.ended();
  await copyFile(join(fresh.directory, 'worklog.db'), join(directory, 'worklog.db'));
  const old = await readFile(join(directory, 'daily.db'));

  const seen = await everything(t, directory);

  assert.deepEqual(seen.notes, []);
  assert.deepEqual(await readFile(join(directory, 'daily.db')), old);
  const files = await readdir(directory);
  assert.ok(files.includes('daily.db') && files.includes('worklog.db'), files.join(', '));
});

test('an empty directory starts empty and holds only worklog.db', async (t) => {
  const plugin = await startedAndShaken(t);
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  plugin.stop();
  await plugin.ended();

  assert.deepEqual(view.entries, []);
  assert.deepEqual(await readdir(plugin.directory), ['worklog.db']);
});
