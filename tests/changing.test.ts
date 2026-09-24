/**
 * An Entry changes, is edited and is deleted, and every mistake in asking is
 * one sentence rather than a crash.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  startedAndShaken,
  structureOf,
  type CycleView,
  type Entry,
  type Started,
} from './helpers/plugin.ts';

async function anEntry(plugin: Started, status = 'Todo'): Promise<Entry> {
  return structureOf<Entry>(
    await plugin.call('create_entry', { title: 'Draft the notes', body: 'first try', status }),
  );
}

test('update_entry changes the title, the body and the Status, and get_cycle shows it', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin);

  const changed = structureOf<Entry>(
    await plugin.call('update_entry', {
      id: entry.id,
      title: 'Draft the Meeting notes',
      body: '- with a list',
      status: 'In Progress',
    }),
  );
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(changed.title, 'Draft the Meeting notes');
  assert.equal(changed.body, '- with a list');
  assert.equal(changed.status, 'In Progress');
  assert.equal(changed.id, entry.id);
  assert.deepEqual(view.entries, [changed]);
});

test('any Status can go to any other Status', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin);

  for (const status of ['Done', 'Todo', 'In Progress', 'Done', 'In Progress', 'Todo']) {
    const changed = structureOf<Entry>(await plugin.call('update_entry', { id: entry.id, status }));
    assert.equal(changed.status, status);
  }
});

test('update_entry changes only what it is given', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin, 'In Progress');

  const changed = structureOf<Entry>(
    await plugin.call('update_entry', { id: entry.id, title: 'A better title' }),
  );

  assert.equal(changed.title, 'A better title');
  assert.equal(changed.body, entry.body);
  assert.equal(changed.status, entry.status);
});

test('a body of null takes the body away', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin);

  const changed = structureOf<Entry>(await plugin.call('update_entry', { id: entry.id, body: null }));

  assert.equal(changed.body, null);
});

test('delete_entry removes the Entry from the Cycle', async (t) => {
  const plugin = await startedAndShaken(t);
  const kept = await anEntry(plugin);
  const gone = await anEntry(plugin);

  const answer = await plugin.call('delete_entry', { id: gone.id });
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(answer.error, undefined);
  assert.deepEqual(view.entries, [kept]);
});

test('an unknown id is refused in one sentence that names it', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const [tool, args] of [
    ['update_entry', { id: 999, title: 'x' }],
    ['delete_entry', { id: 999 }],
  ] as const) {
    const answer = await plugin.call(tool, args);
    assert.equal(answer.error?.code, -32602, tool);
    assert.match(answer.error?.message ?? '', /999/);
  }
});

test('an id that is not a number is refused in one sentence', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('delete_entry', { id: 'the first one' });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /"id"/);
});

test('a bad Status on update is refused, and the Entry is left as it was', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin);

  const answer = await plugin.call('update_entry', { id: entry.id, status: 'Blocked' });
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /Todo/);
  assert.deepEqual(view.entries, [entry]);
});

test('an update that changes nothing is refused in one sentence', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await anEntry(plugin);

  const answer = await plugin.call('update_entry', { id: entry.id });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /at least one/);
});
