/**
 * An Entry can carry a Link: the address of the issue or pull request it is
 * about. Only an http or https address is kept, because the Page opens it on
 * a click. An old worklog.db moves up to the schema with a Link, and every
 * Entry in it has none.
 */
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  makeDirectory,
  startedAndShaken,
  structureOf,
  textOf,
  type CycleView,
  type Entry,
} from './helpers/plugin.ts';

const ISSUE = 'https://linear.app/team/issue/ENG-42/fix-the-page';
const PULL = 'https://github.com/luanAfons0/worklog/pull/7';

test('create_entry keeps the Link it is given, and get_cycle shows it', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'Fix the page', status: 'Todo', link: ISSUE }),
  );
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(entry.link, ISSUE);
  assert.deepEqual(view.entries, [entry]);
});

test('an Entry made with no Link has a link of null', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'Fix the page', status: 'Todo' }),
  );

  assert.equal(entry.link, null);
});

test('a Link is kept trimmed', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'x', status: 'Todo', link: `  ${PULL}\n` }),
  );

  assert.equal(entry.link, PULL);
});

test('update_entry changes the Link, and leaves it when it is not given', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'Fix the page', status: 'Todo', link: ISSUE }),
  );

  const changed = structureOf<Entry>(
    await plugin.call('update_entry', { id: entry.id, link: PULL }),
  );
  const retitled = structureOf<Entry>(
    await plugin.call('update_entry', { id: entry.id, title: 'Fix the whole page' }),
  );

  assert.equal(changed.link, PULL);
  assert.equal(retitled.link, PULL);
});

test('a Link of null or "" takes the Link away', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const cleared of [null, '', '   ']) {
    const entry = structureOf<Entry>(
      await plugin.call('create_entry', { title: 'x', status: 'Todo', link: ISSUE }),
    );
    const changed = structureOf<Entry>(
      await plugin.call('update_entry', { id: entry.id, link: cleared }),
    );
    assert.equal(changed.link, null, JSON.stringify(cleared));
  }
});

test('a Link that is not an http or https address is refused, and nothing is kept', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'x', status: 'Todo', link: ISSUE }),
  );

  for (const link of [
    'javascript:alert(1)',
    'ftp://x',
    'not a url',
    'github.com/owner/repo',
    'data:text/html,hi',
    `https://example.com/${'a'.repeat(2048)}`,
    42,
  ]) {
    const made = await plugin.call('create_entry', { title: 'y', status: 'Todo', link });
    const changed = await plugin.call('update_entry', { id: entry.id, link });
    assert.equal(made.error?.code, -32602, `create_entry took ${String(link).slice(0, 40)}`);
    assert.equal(changed.error?.code, -32602, `update_entry took ${String(link).slice(0, 40)}`);
    assert.match(made.error?.message ?? '', /"link"/);
  }
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  assert.deepEqual(view.entries, [entry]);
});

test('an Entry keeps its Link when it moves, and when a Cycle starts', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'x', status: 'Todo', link: ISSUE }),
  );

  const moved = structureOf<Entry>(
    await plugin.call('move_entry', { id: entry.id, status: 'In Progress' }),
  );
  await plugin.call('start_cycle');
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  const gone = structureOf<Entry>(await plugin.call('delete_entry', { id: entry.id }));

  assert.equal(moved.link, ISSUE);
  assert.equal(view.entries[0]?.link, ISSUE);
  assert.equal(gone.link, ISSUE);
});

test('the Meeting names an Entry with a Link as a Markdown link to it', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.call('create_entry', { title: 'Fix the [page]', status: 'Done', link: ISSUE });
  await plugin.call('create_entry', {
    title: 'Read it',
    status: 'Todo',
    link: 'https://example.com/a (b)',
  });
  await plugin.call('create_entry', { title: 'No Link', status: 'Todo' });

  const markdown = textOf(await plugin.call('meeting_markdown'));

  assert.equal(
    markdown,
    [
      '## Done',
      '',
      `- [Fix the \\[page\\]](${ISSUE})`,
      '',
      '## Working on',
      '',
      '- [Read it](https://example.com/a%20%28b%29)',
      '- No Link',
      '',
    ].join('\n'),
  );
});

test('an old worklog.db moves up to the Link, and keeps every Entry with no Link', async (t) => {
  const directory = await makeDirectory(t);
  const old = new DatabaseSync(join(directory, 'worklog.db'));
  old.exec(`
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
    INSERT INTO entries (cycle_id, title, body, status, created_at, updated_at, position)
      VALUES (1, 'kept from before', 'its body', 'In Progress', '2026-09-24T10:00:00.000Z',
              '2026-09-24T10:00:00.000Z', 1);
  `);
  old.close();

  const plugin = await startedAndShaken(t, { directory });
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  const changed = structureOf<Entry>(
    await plugin.call('update_entry', { id: 1, link: PULL }),
  );
  plugin.stop();
  await plugin.ended();

  assert.equal(view.entries.length, 1);
  assert.equal(view.entries[0]?.title, 'kept from before');
  assert.equal(view.entries[0]?.body, 'its body');
  assert.equal(view.entries[0]?.link, null);
  assert.equal(changed.link, PULL);
  const moved = new DatabaseSync(join(directory, 'worklog.db'));
  const row = moved.prepare('PRAGMA user_version').get() as { user_version: number };
  moved.close();
  assert.equal(row.user_version, 5);
});
