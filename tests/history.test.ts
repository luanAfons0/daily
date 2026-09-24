/**
 * Every Cycle is kept, and can be looked back at. A `Done` Entry in an earlier
 * Cycle that is set back to work moves into the current Cycle.
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

type Summary = {
  readonly id: number;
  readonly startedAt: string;
  readonly current: boolean;
  readonly counts: {
    readonly Todo: number;
    readonly 'In Progress': number;
    readonly 'In Review': number;
    readonly Done: number;
  };
};
type Cycles = { readonly cycles: readonly Summary[] };
type StartedCycle = { readonly cycle: { readonly id: number } };

async function add(plugin: Started, title: string, status: string): Promise<Entry> {
  return structureOf<Entry>(await plugin.call('create_entry', { title, status }));
}

async function start(plugin: Started): Promise<number> {
  return structureOf<StartedCycle>(await plugin.call('start_cycle')).cycle.id;
}

test('list_cycles is every Cycle, newest first, with its Entries counted by Status', async (t) => {
  const plugin = await startedAndShaken(t);
  await add(plugin, 'a', 'Done');
  await add(plugin, 'b', 'Done');
  await add(plugin, 'c', 'Todo');
  const first = structureOf<CycleView>(await plugin.call('get_cycle')).cycle.id;
  const second = await start(plugin);
  await add(plugin, 'd', 'In Progress');
  const third = await start(plugin);
  await add(plugin, 'e', 'Done');

  const { cycles } = structureOf<Cycles>(await plugin.call('list_cycles'));

  assert.deepEqual(
    cycles.map((cycle) => [cycle.id, cycle.current, cycle.counts]),
    [
      [third, true, { Todo: 1, 'In Progress': 1, 'In Review': 0, Done: 1 }],
      [second, false, { Todo: 0, 'In Progress': 0, 'In Review': 0, Done: 0 }],
      [first, false, { Todo: 0, 'In Progress': 0, 'In Review': 0, Done: 2 }],
    ],
  );
  for (const cycle of cycles) assert.ok(!Number.isNaN(Date.parse(cycle.startedAt)));
});

test('list_cycles on a fresh Plugin directory has the first Cycle, started by itself', async (t) => {
  const plugin = await startedAndShaken(t);

  const { cycles } = structureOf<Cycles>(await plugin.call('list_cycles'));

  assert.equal(cycles.length, 1);
  assert.equal(cycles[0]?.current, true);
});

test('get_cycle with an id shows that earlier Cycle and what was Done in it', async (t) => {
  const plugin = await startedAndShaken(t);
  const done = await add(plugin, 'Finished last time', 'Done');
  await add(plugin, 'Still going', 'In Progress');
  await start(plugin);

  const earlier = structureOf<CycleView>(await plugin.call('get_cycle', { id: done.cycleId }));

  assert.equal(earlier.cycle.id, done.cycleId);
  assert.equal(earlier.cycle.current, false);
  assert.deepEqual(earlier.entries, [done]);
});

test('get_cycle with the current id is the same as get_cycle with none', async (t) => {
  const plugin = await startedAndShaken(t);
  await add(plugin, 'x', 'Todo');
  const current = structureOf<CycleView>(await plugin.call('get_cycle'));

  const named = structureOf<CycleView>(await plugin.call('get_cycle', { id: current.cycle.id }));

  assert.deepEqual(named, current);
});

test('get_cycle with an unknown id is refused in one sentence that names it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('get_cycle', { id: 77 });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /77/);
});

test('get_cycle with an id that is not a number is refused in one sentence', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('get_cycle', { id: 'last week' });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /"id"/);
});

test('an earlier Done Entry set back to In Progress moves into the current Cycle', async (t) => {
  const plugin = await startedAndShaken(t);
  const done = await add(plugin, 'Thought it was finished', 'Done');
  const current = await start(plugin);

  const reopened = structureOf<Entry>(
    await plugin.call('update_entry', { id: done.id, status: 'In Progress' }),
  );
  const now = structureOf<CycleView>(await plugin.call('get_cycle'));
  const earlier = structureOf<CycleView>(await plugin.call('get_cycle', { id: done.cycleId }));

  assert.equal(reopened.cycleId, current);
  assert.deepEqual(now.entries, [reopened]);
  assert.deepEqual(earlier.entries, []);
});

test('an earlier Done Entry set back to Todo moves too, and one left Done stays', async (t) => {
  const plugin = await startedAndShaken(t);
  const reopened = await add(plugin, 'reopen me', 'Done');
  const kept = await add(plugin, 'leave me', 'Done');
  const current = await start(plugin);

  await plugin.call('update_entry', { id: reopened.id, status: 'Todo' });
  await plugin.call('update_entry', { id: kept.id, title: 'leave me, renamed' });
  const earlier = structureOf<CycleView>(await plugin.call('get_cycle', { id: kept.cycleId }));
  const now = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.deepEqual(
    earlier.entries.map((entry) => [entry.id, entry.title]),
    [[kept.id, 'leave me, renamed']],
  );
  assert.deepEqual(
    now.entries.map((entry) => [entry.id, entry.cycleId, entry.status]),
    [[reopened.id, current, 'Todo']],
  );
});

test('an Entry set to Done in the current Cycle stays in it', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await add(plugin, 'finish now', 'In Progress');

  const done = structureOf<Entry>(await plugin.call('update_entry', { id: entry.id, status: 'Done' }));

  assert.equal(done.cycleId, entry.cycleId);
});

test('every Cycle is kept across a restart', async (t) => {
  const first = await startedAndShaken(t);
  await start(first);
  await start(first);
  const before = structureOf<Cycles>(await first.call('list_cycles'));
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory: first.directory });
  const after = structureOf<Cycles>(await second.call('list_cycles'));

  assert.equal(after.cycles.length, 3);
  assert.deepEqual(after, before);
});
