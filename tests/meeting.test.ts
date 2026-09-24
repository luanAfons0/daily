/**
 * The Markdown for the Meeting lists the right Entries, in the right sections
 * and in the right order.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  startedAndShaken,
  structureOf,
  textOf,
  type Entry,
  type Started,
} from './helpers/plugin.ts';

type Meeting = {
  readonly markdown: string;
  readonly done: readonly number[];
  readonly workingOn: readonly number[];
};

async function add(plugin: Started, title: string, status: string): Promise<Entry> {
  return structureOf<Entry>(await plugin.call('create_entry', { title, status }));
}

test('Done lists the last Cycle’s Done Entries, then this one’s; Working on lists In Progress, then Todo', async (t) => {
  const plugin = await startedAndShaken(t);
  // Two Cycles ago: Done here is history, and not for this Meeting.
  await add(plugin, 'Long ago', 'Done');
  await plugin.call('start_cycle');
  // The Cycle before the current one.
  await add(plugin, 'Wrote the wrapper', 'Done');
  await add(plugin, 'Carried over', 'Todo');
  await add(plugin, 'Also carried', 'In Progress');
  await plugin.call('start_cycle');
  // The current Cycle.
  await add(plugin, 'Fixed the page', 'Done');
  await add(plugin, 'Reviewing the spec', 'In Progress');

  const answer = await plugin.call('meeting_markdown');

  assert.equal(
    textOf(answer),
    [
      '## Done',
      '',
      '- Wrote the wrapper',
      '- Fixed the page',
      '',
      '## Working on',
      '',
      '- Also carried',
      '- Reviewing the spec',
      '- Carried over',
      '',
    ].join('\n'),
  );
});

test('the structure names the same Entries as the Markdown, section by section', async (t) => {
  const plugin = await startedAndShaken(t);
  const done = await add(plugin, 'done', 'Done');
  const todo = await add(plugin, 'todo', 'Todo');
  const doing = await add(plugin, 'doing', 'In Progress');

  const answer = await plugin.call('meeting_markdown');
  const meeting = structureOf<Meeting>(answer);

  assert.deepEqual(meeting.done, [done.id]);
  assert.deepEqual(meeting.workingOn, [doing.id, todo.id]);
  assert.equal(meeting.markdown, textOf(answer));
});

test('an empty section says Nothing rather than disappearing', async (t) => {
  const plugin = await startedAndShaken(t);

  const markdown = textOf(await plugin.call('meeting_markdown'));

  assert.equal(markdown, '## Done\n\n- Nothing.\n\n## Working on\n\n- Nothing.\n');
});

test('a title with a line break stays one bullet', async (t) => {
  const plugin = await startedAndShaken(t);
  await add(plugin, 'first line\n## not a heading', 'Todo');

  const markdown = textOf(await plugin.call('meeting_markdown'));

  assert.ok(markdown.includes('- first line ## not a heading\n'), markdown);
});

test('Notes are never part of the Meeting', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.call('create_note', { body: 'private thought' });

  const markdown = textOf(await plugin.call('meeting_markdown'));

  assert.ok(!markdown.includes('private thought'), markdown);
});
