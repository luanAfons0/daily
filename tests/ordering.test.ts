/**
 * The order of the Entries in a column is the person's to set: move_entry
 * puts an Entry above another one, or at the end, and every read keeps it.
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

/** What meeting_markdown answers, as far as this file reads it. */
type Meeting = { readonly workingOn: readonly number[] };

async function added(plugin: Started, title: string, status = 'Todo'): Promise<Entry> {
  return structureOf<Entry>(await plugin.call('create_entry', { title, status }));
}

/** The titles of one column of the current Cycle, top to bottom. */
async function column(plugin: Started, status: string): Promise<string[]> {
  const view = structureOf<CycleView>(await plugin.call('get_cycle'));
  return view.entries.filter((entry) => entry.status === status).map((entry) => entry.title);
}

test('a new Entry goes to the end of its column', async (t) => {
  const plugin = await startedAndShaken(t);
  await added(plugin, 'first');
  await added(plugin, 'second');
  await added(plugin, 'third');

  assert.deepEqual(await column(plugin, 'Todo'), ['first', 'second', 'third']);
});

test('move_entry puts an Entry above the one named in "before"', async (t) => {
  const plugin = await startedAndShaken(t);
  const first = await added(plugin, 'first');
  await added(plugin, 'second');
  const third = await added(plugin, 'third');

  await plugin.call('move_entry', { id: third.id, before: first.id });

  assert.deepEqual(await column(plugin, 'Todo'), ['third', 'first', 'second']);
});

test('move_entry with no "before" puts an Entry at the end of its column', async (t) => {
  const plugin = await startedAndShaken(t);
  const first = await added(plugin, 'first');
  await added(plugin, 'second');

  await plugin.call('move_entry', { id: first.id });

  assert.deepEqual(await column(plugin, 'Todo'), ['second', 'first']);
});

test('move_entry with a Status moves an Entry into that column, at the place given', async (t) => {
  const plugin = await startedAndShaken(t);
  const todo = await added(plugin, 'todo');
  const top = await added(plugin, 'top', 'In Progress');
  await added(plugin, 'bottom', 'In Progress');

  const moved = structureOf<Entry>(
    await plugin.call('move_entry', { id: todo.id, status: 'In Progress', before: top.id }),
  );

  assert.equal(moved.status, 'In Progress');
  assert.deepEqual(await column(plugin, 'In Progress'), ['todo', 'top', 'bottom']);
  assert.deepEqual(await column(plugin, 'Todo'), []);
});

test('an Entry given a new Status by update_entry goes to the end of its new column', async (t) => {
  const plugin = await startedAndShaken(t);
  const early = await added(plugin, 'early');
  await added(plugin, 'late', 'Done');

  await plugin.call('update_entry', { id: early.id, status: 'Done' });

  assert.deepEqual(await column(plugin, 'Done'), ['late', 'early']);
});

test('the Meeting lists each section in the order of its column', async (t) => {
  const plugin = await startedAndShaken(t);
  const first = await added(plugin, 'first', 'In Progress');
  const second = await added(plugin, 'second', 'In Progress');

  await plugin.call('move_entry', { id: second.id, before: first.id });
  const meeting = structureOf<Meeting>(await plugin.call('meeting_markdown'));

  assert.deepEqual(meeting.workingOn, [second.id, first.id]);
});

test('a "before" in another column is refused in one sentence, and nothing moves', async (t) => {
  const plugin = await startedAndShaken(t);
  const todo = await added(plugin, 'todo');
  const doing = await added(plugin, 'doing', 'In Progress');

  const answer = await plugin.call('move_entry', { id: todo.id, before: doing.id });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /move_entry needs "before"/);
  assert.deepEqual(await column(plugin, 'Todo'), ['todo']);
});

test('an Entry cannot be put above itself', async (t) => {
  const plugin = await startedAndShaken(t);
  const only = await added(plugin, 'only');

  const answer = await plugin.call('move_entry', { id: only.id, before: only.id });

  assert.equal(answer.error?.code, -32602);
});

test('the order survives a restart', async (t) => {
  const first = await startedAndShaken(t);
  const a = await added(first, 'a');
  const b = await added(first, 'b');
  await first.call('move_entry', { id: b.id, before: a.id });
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory: first.directory });

  assert.deepEqual(await column(second, 'Todo'), ['b', 'a']);
});
