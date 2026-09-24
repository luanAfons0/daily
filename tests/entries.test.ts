/**
 * An Entry is added to the current Cycle, and the first Cycle starts by
 * itself the first time anything needs one.
 */
import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { startedAndShaken, structureOf, type CycleView, type Entry } from './helpers/plugin.ts';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

test('a fresh Plugin directory gets its first Cycle on the first get_cycle', async (t) => {
  const plugin = await startedAndShaken(t);

  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(view.cycle.current, true);
  assert.ok(!Number.isNaN(Date.parse(view.cycle.startedAt)), view.cycle.startedAt);
  assert.deepEqual(view.entries, []);
});

test('the first Cycle is started once, not again on every read', async (t) => {
  const plugin = await startedAndShaken(t);

  const first = structureOf<CycleView>(await plugin.call('get_cycle'));
  const again = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(again.cycle.id, first.cycle.id);
});

test('create_entry puts the Entry in the current Cycle with the Status given', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = structureOf<Entry>(
    await plugin.call('create_entry', {
      title: 'Review the carry-over rules',
      body: 'See **ADR-0001**.',
      status: 'In Progress',
    }),
  );
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(entry.cycleId, view.cycle.id);
  assert.deepEqual(view.entries, [entry]);
  assert.equal(entry.title, 'Review the carry-over rules');
  assert.equal(entry.body, 'See **ADR-0001**.');
  assert.equal(entry.status, 'In Progress');
});

test('an Entry with no body has none, rather than an empty one', async (t) => {
  const plugin = await startedAndShaken(t);

  const entry = structureOf<Entry>(
    await plugin.call('create_entry', { title: 'Ship it', body: '  ', status: 'Done' }),
  );

  assert.equal(entry.body, null);
});

test('every Status there is can start an Entry', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const status of ['Todo', 'In Progress', 'Done']) {
    const entry = structureOf<Entry>(await plugin.call('create_entry', { title: status, status }));
    assert.equal(entry.status, status);
  }
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  assert.equal(view.entries.length, 3);
});

test('an Entry with no title is refused in one sentence, and nothing is added', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('create_entry', { title: '   ', status: 'Todo' });
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /title/);
  assert.deepEqual(view.entries, []);
});

test('a Status that is not one of the three is refused with a sentence naming the three', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('create_entry', { title: 'Wait on legal', status: 'Blocked' });

  assert.equal(answer.error?.code, -32602);
  const said = answer.error?.message ?? '';
  for (const status of ['Todo', 'In Progress', 'Done', 'Blocked']) {
    assert.ok(said.includes(status), said);
  }
});

test('a body that is not text is refused in one sentence', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('create_entry', { title: 'x', body: 42, status: 'Todo' });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /body/);
});

test('the Entries survive a restart, in daily.db in the Plugin directory', async (t) => {
  const first = await startedAndShaken(t);
  const entry = structureOf<Entry>(
    await first.call('create_entry', { title: 'Remember me', status: 'Todo' }),
  );
  first.stop();
  await first.ended();

  await access(join(first.directory, 'daily.db'));
  const second = await startedAndShaken(t, { directory: first.directory });
  const view = structureOf<CycleView>(await second.call('get_cycle'));

  assert.deepEqual(view.entries, [entry]);
});

test('git ignores daily.db, so nobody commits their Entries', async () => {
  const ignored = (await readFile(join(REPOSITORY, '.gitignore'), 'utf8')).split('\n');

  assert.ok(ignored.includes('daily.db'), '.gitignore does not name daily.db');
});
