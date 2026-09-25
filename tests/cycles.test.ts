/**
 * A Cycle starts when its tool is called, and every Entry that is not `Done`
 * moves into it (ADR-0001). A Note never moves.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  startedAndShaken,
  structureOf,
  textOf,
  type CycleView,
  type Entry,
  type Note,
  type Started,
} from './helpers/plugin.ts';

type StartedCycle = {
  readonly cycle: { readonly id: number; readonly startedAt: string };
  readonly moved: number;
  readonly said: string;
};

async function add(plugin: Started, title: string, status: string): Promise<Entry> {
  return structureOf<Entry>(await plugin.call('create_entry', { title, status }));
}

test('start_cycle moves Todo and In Progress Entries, keeps their Status, and leaves Done ones', async (t) => {
  const plugin = await startedAndShaken(t);
  const todo = await add(plugin, 'Plan the week', 'Todo');
  const doing = await add(plugin, 'Write the wrapper', 'In Progress');
  const done = await add(plugin, 'Ship the page', 'Done');

  const started = structureOf<StartedCycle>(await plugin.call('start_cycle'));
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(view.cycle.id, started.cycle.id);
  assert.notEqual(started.cycle.id, todo.cycleId);
  assert.equal(started.moved, 2);
  assert.deepEqual(
    view.entries.map((entry) => [entry.id, entry.status, entry.cycleId]),
    [
      [todo.id, 'Todo', started.cycle.id],
      [doing.id, 'In Progress', started.cycle.id],
    ],
  );
  assert.ok(!view.entries.some((entry) => entry.id === done.id), 'a Done Entry moved');
});

test('a moved Entry is the same Entry, not a copy', async (t) => {
  const plugin = await startedAndShaken(t);
  const entry = await add(plugin, 'Carry me', 'In Progress');

  await plugin.call('start_cycle');
  await plugin.call('start_cycle');
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(view.entries.length, 1);
  const moved = view.entries[0]!;
  assert.equal(moved.id, entry.id);
  assert.equal(moved.title, entry.title);
  assert.equal(moved.createdAt, entry.createdAt);
});

test('two calls in a row start two Cycles', async (t) => {
  const plugin = await startedAndShaken(t);

  const first = structureOf<StartedCycle>(await plugin.call('start_cycle'));
  const second = structureOf<StartedCycle>(await plugin.call('start_cycle'));
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.notEqual(first.cycle.id, second.cycle.id);
  assert.equal(view.cycle.id, second.cycle.id);
});

test('start_cycle on a fresh Plugin directory starts a Cycle after the first one', async (t) => {
  const plugin = await startedAndShaken(t);

  const started = structureOf<StartedCycle>(await plugin.call('start_cycle'));
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));

  assert.equal(view.cycle.id, started.cycle.id);
  assert.equal(started.moved, 0);
});

test('the answer is one sentence that names the Cycle and counts what moved', async (t) => {
  const plugin = await startedAndShaken(t);
  await add(plugin, 'one', 'Todo');
  await add(plugin, 'two', 'In Progress');
  await add(plugin, 'three', 'Todo');

  const answer = await plugin.call('start_cycle');
  const said = textOf(answer);

  assert.match(
    said,
    /^Started the Cycle of (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2} and moved 3 Entries into it\.$/,
  );
  assert.equal(structureOf<StartedCycle>(answer).said, said);
});

test('the sentence says 1 Entry, and no Entries, the way a person would', async (t) => {
  const plugin = await startedAndShaken(t);

  assert.match(textOf(await plugin.call('start_cycle')), /and moved no Entries into it\.$/);
  await add(plugin, 'alone', 'Todo');
  assert.match(textOf(await plugin.call('start_cycle')), /and moved 1 Entry into it\.$/);
});

test('the Cycle is named on the clock of the machine Worklog runs on', async (t) => {
  const plugin = await startedAndShaken(t, { env: { TZ: 'Asia/Tokyo' } });

  const answer = await plugin.call('start_cycle');
  const started = structureOf<StartedCycle>(answer);

  const tokyo = new Date(Date.parse(started.cycle.startedAt) + 9 * 60 * 60 * 1000);
  const clock = `${String(tokyo.getUTCHours()).padStart(2, '0')}:${String(tokyo.getUTCMinutes()).padStart(2, '0')}`;
  assert.ok(textOf(answer).includes(` ${tokyo.getUTCDate()} `), textOf(answer));
  assert.ok(textOf(answer).includes(clock), `${textOf(answer)} does not say ${clock}`);
});

test('start_cycle never moves a Note, and never changes one', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = structureOf<Note>(await plugin.call('create_note', { body: 'stay put' }));
  await add(plugin, 'moves', 'Todo');

  await plugin.call('start_cycle');
  await plugin.call('start_cycle');
  const listed = structureOf<{ notes: Note[] }>(await plugin.call('list_notes'));

  assert.deepEqual(listed.notes, [note]);
});

test('Entries added after a Cycle starts go into it', async (t) => {
  const plugin = await startedAndShaken(t);
  const started = structureOf<StartedCycle>(await plugin.call('start_cycle'));

  const entry = await add(plugin, 'fresh', 'Todo');

  assert.equal(entry.cycleId, started.cycle.id);
});
