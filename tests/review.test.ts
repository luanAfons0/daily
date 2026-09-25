/**
 * In Review is the fourth Status: after In Progress, before Done. It is not
 * Done, so it moves with a new Cycle, and the Meeting gives it a section.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  startedAndShaken,
  structureOf,
  textOf,
  type CycleView,
  type Entry,
  type Started,
} from './helpers/plugin.ts';

type Meeting = {
  readonly markdown: string;
  readonly done: readonly number[];
  readonly inReview: readonly number[];
  readonly workingOn: readonly number[];
};

type Listed = {
  readonly cycles: readonly { readonly current: boolean; readonly counts: object }[];
};

async function add(plugin: Started, title: string, status: string): Promise<Entry> {
  return structureOf<Entry>(await plugin.call('create_entry', { title, status }));
}

test('an Entry can start In Review, and any Status can go to it and from it', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = await add(plugin, 'Waiting on a review', 'In Review');
  const done = structureOf<Entry>(
    await plugin.call('update_entry', { id: entry.id, status: 'Done' }),
  );
  const back = structureOf<Entry>(
    await plugin.call('update_entry', { id: entry.id, status: 'In Review' }),
  );

  assert.equal(entry.status, 'In Review');
  assert.equal(done.status, 'Done');
  assert.equal(back.status, 'In Review');
});

test('a new Cycle carries an In Review Entry with it, since it is not Done', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await add(plugin, 'Waiting on a review', 'In Review');

  await plugin.call('start_cycle');
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.deepEqual(
    view.entries.map((one) => [one.id, one.status]),
    [[entry.id, 'In Review']],
  );
});

test('list_cycles counts In Review with the other three', async (t) => {
  const plugin = await startedAndShaken(t);
  await add(plugin, 'Waiting on a review', 'In Review');

  const listed = structureOf<Listed>(await plugin.call('list_cycles'));

  assert.deepEqual(listed.cycles[0]?.counts, {
    Todo: 0,
    'In Progress': 0,
    'In Review': 1,
    Done: 0,
  });
});

test('the Meeting says what is In Review in a section of its own, between Done and Working on', async (t) => {
  const plugin = await startedAndShaken(t);
  const done = await add(plugin, 'Shipped it', 'Done');
  const review = await add(plugin, 'Waiting on a review', 'In Review');
  const doing = await add(plugin, 'Writing it', 'In Progress');

  const answer = await plugin.call('meeting_markdown');
  const meeting = structureOf<Meeting>(answer);

  assert.deepEqual(meeting.done, [done.id]);
  assert.deepEqual(meeting.inReview, [review.id]);
  assert.deepEqual(meeting.workingOn, [doing.id]);
  assert.equal(
    textOf(answer),
    [
      '## Done',
      '',
      '- Shipped it',
      '',
      '## In review',
      '',
      '- Waiting on a review',
      '',
      '## Working on',
      '',
      '- Writing it',
      '',
    ].join('\n'),
  );
});

test('a Status that is not one of the four is refused with a sentence naming the four', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('create_entry', { title: 'x', status: 'Blocked' });

  assert.equal(answer.error?.code, -32602);
  assert.match(
    answer.error?.message ?? '',
    /"Todo", "In Progress", "In Review" or "Done"/,
  );
});

test('a daily.db from before In Review moves up with every Entry, its place and its Status', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'worklog-v3-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const old = new DatabaseSync(join(directory, 'daily.db'));
  old.exec(`
    CREATE TABLE cycles (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL);
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY, cycle_id INTEGER NOT NULL REFERENCES cycles (id),
      title TEXT NOT NULL, body TEXT,
      status TEXT NOT NULL CHECK (status IN ('Todo', 'In Progress', 'Done')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX entries_by_cycle ON entries (cycle_id);
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY, body TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO cycles (started_at) VALUES ('2026-09-24T10:00:00.000Z');
    INSERT INTO entries (cycle_id, title, body, status, created_at, updated_at, position)
      VALUES (1, 'second', NULL, 'Todo', '2026-09-24T10:00:00.000Z', '2026-09-24T10:00:00.000Z', 2),
             (1, 'first', 'kept', 'In Progress', '2026-09-24T10:00:00.000Z',
              '2026-09-24T10:00:00.000Z', 1);
    PRAGMA user_version = 3;
  `);
  old.close();

  const plugin = await startedAndShaken(t, { directory });
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  const moved = await add(plugin, 'now possible', 'In Review');

  assert.deepEqual(
    view.entries.map((entry) => [entry.title, entry.body, entry.status]),
    [
      ['first', 'kept', 'In Progress'],
      ['second', null, 'Todo'],
    ],
  );
  assert.equal(moved.status, 'In Review');
});
