/**
 * The Markdown for the Meeting: what is Done, and what is being worked on.
 *
 * It answers the two questions of the Meeting and nothing more, so it lists
 * titles, not bodies. It is read after the Meeting's `start_cycle` has run, so
 * "Done" is what was finished in the Cycle before the current one, and
 * whatever is already Done in the current one. Pressed before that run, it
 * also shows what was reported last time; that is accepted.
 */
import { currentCycle } from './cycles.ts';
import { entriesIn, type Entry } from './entries.ts';
import type { Store } from './store.ts';

/** The Markdown, and the Entries it names, section by section. */
export type MeetingMarkdown = {
  readonly markdown: string;
  readonly done: readonly number[];
  readonly workingOn: readonly number[];
};

/** Build the Markdown for the Meeting from the current Cycle and the one before it. */
export function meetingMarkdown(store: Store): MeetingMarkdown {
  const current = currentCycle(store);
  const before = store
    .prepare('SELECT id FROM cycles WHERE id < ? ORDER BY id DESC LIMIT 1')
    .get(current.id) as { id: number } | undefined;

  const now = entriesIn(store, current.id);
  const done = [
    ...(before === undefined ? [] : entriesIn(store, before.id)),
    ...now,
  ].filter((entry) => entry.status === 'Done');
  const workingOn = [
    ...now.filter((entry) => entry.status === 'In Progress'),
    ...now.filter((entry) => entry.status === 'Todo'),
  ];

  const markdown = [
    '## Done',
    '',
    ...listed(done),
    '',
    '## Working on',
    '',
    ...listed(workingOn),
    '',
  ].join('\n');
  return { markdown, done: done.map(idOf), workingOn: workingOn.map(idOf) };
}

/** One bullet per Entry, or one that says there is none. */
function listed(entries: readonly Entry[]): string[] {
  if (entries.length === 0) return ['- Nothing.'];
  return entries.map((entry) => `- ${oneLine(entry.title)}`);
}

/** A title on one line, so it can never break the list it is in. */
function oneLine(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function idOf(entry: Entry): number {
  return entry.id;
}
