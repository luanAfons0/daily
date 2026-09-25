/**
 * The Markdown for the Meeting: what is Done, what waits In Review, and what
 * is being worked on. In review is said only when something is waiting.
 *
 * It answers the two questions of the Meeting and nothing more, so it lists
 * titles, not bodies; a title with a Link is a Markdown link to it. It is read after the Meeting's `start_cycle` has run, so
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
  readonly inReview: readonly number[];
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
  const inReview = now.filter((entry) => entry.status === 'In Review');
  const workingOn = [
    ...now.filter((entry) => entry.status === 'In Progress'),
    ...now.filter((entry) => entry.status === 'Todo'),
  ];

  const markdown = [
    '## Done',
    '',
    ...listed(done),
    '',
    // Said only when there is something waiting, so a team that never uses
    // In Review hears the Meeting it always heard.
    ...(inReview.length === 0 ? [] : ['## In review', '', ...listed(inReview), '']),
    '## Working on',
    '',
    ...listed(workingOn),
    '',
  ].join('\n');
  return {
    markdown,
    done: done.map(idOf),
    inReview: inReview.map(idOf),
    workingOn: workingOn.map(idOf),
  };
}

/** One bullet per Entry, or one that says there is none. */
function listed(entries: readonly Entry[]): string[] {
  if (entries.length === 0) return ['- Nothing.'];
  return entries.map((entry) => `- ${named(entry)}`);
}

/** What a Link may hold that would end a Markdown link, and how it is written. */
const ESCAPED: Readonly<Record<string, string>> = { ' ': '%20', '(': '%28', ')': '%29' };

/**
 * An Entry as the Meeting names it: its title, as a link to its Link when it
 * has one. The brackets of the title are escaped and the address is kept in
 * one piece, so neither can break the link.
 */
function named(entry: Entry): string {
  const title = oneLine(entry.title);
  if (entry.link === null) return title;
  const text = title.replace(/[\\[\]]/g, (found) => `\\${found}`);
  const address = entry.link.replace(/[ ()]/g, (found) => ESCAPED[found] ?? found);
  return `[${text}](${address})`;
}

/** A title on one line, so it can never break the list it is in. */
function oneLine(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function idOf(entry: Entry): number {
  return entry.id;
}
