/**
 * The text of the edit dialog, run as the bytes a browser is served.
 *
 * `web/live-editor.js` is read off disk and run in a fresh context, as
 * `markdown.test.ts` runs the renderer. No test drives a browser, so what is
 * tested is `liveText`: what Enter, Tab and a tick do to the Markdown, and
 * where a click in a formatted block lands in it.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

type Edit = { value: string; at: number; split?: boolean } | null;

type LiveText = {
  enter(value: string, at: number): Edit;
  toggleTask(source: string, nth: number): string | null;
  countTasks(source: string): number;
  sourceOffset(source: string, shown: string): number;
  indent(value: string, at: number, out: boolean): Edit;
  join(blocks: { source: string; after: string }[]): string;
};

async function liveText(): Promise<LiveText> {
  const code = await readFile(join(REPOSITORY, 'web', 'live-editor.js'), 'utf8');
  const context = createContext({});
  runInContext(code, context);
  return context['liveText'] as LiveText;
}

test('Enter at the end of a list item starts the next one, numbered and boxed', async () => {
  const { enter } = await liveText();

  assert.deepEqual({ ...enter('- one', 5) }, { value: '- one\n- ', at: 8, split: false });
  assert.deepEqual({ ...enter('  3. three', 10) }, { value: '  3. three\n  4. ', at: 16, split: false });
  assert.equal(enter('- [x] done', 10)?.value, '- [x] done\n- [ ] ');
});

test('Enter on an empty list item ends the list, and ends the block', async () => {
  const { enter } = await liveText();

  assert.deepEqual({ ...enter('- one\n- ', 8) }, { value: '- one', at: 5, split: true });
});

test('Enter on an empty line after text ends the block; inside a code fence it is a new line', async () => {
  const { enter } = await liveText();

  assert.deepEqual({ ...enter('Some text\n', 10) }, { value: 'Some text', at: 9, split: true });
  assert.equal(enter('Some text', 9), null);
  assert.equal(enter('```\ncode\n', 9), null);
});

test('a tick in a list or a table flips only its own box', async () => {
  const { toggleTask, countTasks } = await liveText();
  const source = '- [ ] a\n- [x] b\n\n| x | Done |\n| - | - |\n| y | [ ] |';

  assert.equal(countTasks(source), 3);
  assert.equal(toggleTask(source, 1), '- [ ] a\n- [ ] b\n\n| x | Done |\n| - | - |\n| y | [ ] |');
  assert.equal(toggleTask(source, 2), '- [ ] a\n- [x] b\n\n| x | Done |\n| - | - |\n| y | [x] |');
  assert.equal(toggleTask(source, 3), null);
});

test('a click in a formatted block lands at the same place in its Markdown', async () => {
  const { sourceOffset } = await liveText();
  const source = 'Tenho hoje: **Quickdraw**, **Pull Shark**.';

  assert.equal(source.slice(0, sourceOffset(source, 'Tenho hoje: Quick')), 'Tenho hoje: **Quick');
  assert.equal(sourceOffset(source, ''), 0);
});

test('Tab indents a list item, Shift+Tab takes it back, and a paragraph keeps its Tab', async () => {
  const { indent } = await liveText();

  assert.deepEqual({ ...indent('- a\n- b', 7, false) }, { value: '- a\n  - b', at: 9 });
  assert.deepEqual({ ...indent('- a\n  - b', 9, true) }, { value: '- a\n- b', at: 7 });
  assert.equal(indent('plain text', 3, false), null);
});

test('blocks join with the text that was between them, and a blank line where there was none', async () => {
  const { join: joined } = await liveText();

  assert.equal(
    joined([
      { source: 'a', after: '\n' },
      { source: 'b', after: '' },
      { source: 'c', after: '\n' },
    ]),
    'a\nb\n\nc',
  );
});
