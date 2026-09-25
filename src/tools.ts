/**
 * The tools this Plugin ships: one for each thing a person, the Page or
 * another Plugin can ask Worklog to do. Their names are the contract between the
 * Page, Scheduler and every other Plugin with a Grant (FirstMate ADR-0009).
 *
 * Every tool answers the same data twice — as text, for whoever reads it in a
 * terminal, and as structure, for the Page, which draws it.
 */
import {
  currentCycle,
  cycleById,
  listCycles,
  saidOf,
  startCycle,
  viewOf,
} from './cycles.ts';
import {
  checkBody,
  checkId,
  checkStatus,
  checkTitle,
  createEntry,
  deleteEntry,
  moveEntry,
  STATUSES,
  updateEntry,
  type EntryChange,
} from './entries.ts';
import { badInput } from './mcp.ts';
import { meetingMarkdown } from './meeting.ts';
import {
  checkNoteBody,
  checkNoteId,
  checkNoteTitle,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from './notes.ts';
import type { Tool, ToolResult } from './mcp.ts';
import { within, type Store } from './store.ts';

const TITLE = { type: 'string', description: 'One line that says what the Entry is.' };
const BODY = { type: 'string', description: 'Details, as Markdown. Optional.' };
const ID = { type: 'integer', description: 'The id of the Entry, from get_cycle.' };
const NOTE_TITLE = {
  type: 'string',
  description: 'A short name for the Note, apart from its text. Optional.',
};
const NOTE_ID = { type: 'integer', description: 'The id of the Note, from list_notes.' };
const NOTE_BODY = { type: 'string', description: 'The text of the Note, as Markdown.' };
const STATUS = { type: 'string', enum: STATUSES, description: 'Where the Entry stands.' };

/** Where move_entry puts an Entry: above this id, or null for the end. */
function checkBefore(given: unknown): number | null {
  if (given === undefined || given === null) return null;
  if (typeof given === 'number' && Number.isSafeInteger(given) && given > 0) return given;
  throw badInput(
    'move_entry needs "before" as the id of the Entry to go above, or left out for the end.',
  );
}

/** The tools, over one open Store. */
export function toolsFor(store: Store): readonly Tool[] {
  return [
    {
      name: 'get_cycle',
      description: 'One Cycle and every Entry in it: the one named by id, or the current one.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'The id of a Cycle, from list_cycles. Optional.' },
        },
        required: [],
      },
      call: (given) => {
        const id = given['id'] === undefined ? null : checkCycleId(given['id']);
        return told(
          within(store, () =>
            viewOf(store, id === null ? currentCycle(store) : cycleById(store, id)),
          ),
        );
      },
    },

    {
      name: 'list_cycles',
      description:
        'Every Cycle there ever was, newest first, each with its Entries counted by Status.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      call: () => told({ cycles: within(store, () => listCycles(store)) }),
    },

    {
      name: 'start_cycle',
      description:
        'Start a new Cycle, and move every Entry that is not Done into it with its Status ' +
        'unchanged. Done Entries stay where they are. Every call starts exactly one Cycle. ' +
        'It answers one sentence.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      call: () => {
        const started = within(store, () => startCycle(store));
        return {
          content: [{ type: 'text', text: saidOf(started) }],
          structuredContent: { ...started, said: saidOf(started) },
        };
      },
    },

    {
      name: 'create_entry',
      description: 'Add one Entry to the current Cycle, with the Status given.',
      inputSchema: {
        type: 'object',
        properties: { title: TITLE, body: BODY, status: STATUS },
        required: ['title', 'status'],
      },
      call: (given) => {
        const fields = {
          title: checkTitle('create_entry', given['title']),
          body: checkBody('create_entry', given['body']),
          status: checkStatus('create_entry', given['status']),
        };
        return told(within(store, () => createEntry(store, currentCycle(store).id, fields)));
      },
    },

    {
      name: 'update_entry',
      description:
        'Change the title, the body or the Status of one Entry. Any Status may go to any ' +
        'other. A body of null or "" takes the body away.',
      inputSchema: {
        type: 'object',
        properties: { id: ID, title: TITLE, body: BODY, status: STATUS },
        required: ['id'],
      },
      call: (given) => {
        const id = checkId('update_entry', given['id']);
        const change = changeOf(given);
        if (Object.keys(change).length === 0) {
          throw badInput(
            'update_entry needs at least one of "title", "body" or "status" to change.',
          );
        }
        return told(
          within(store, () => updateEntry(store, id, change, () => currentCycle(store).id)),
        );
      },
    },

    {
      name: 'move_entry',
      description:
        'Give one Entry a place in its column: above the Entry named by "before", or at the ' +
        'end when "before" is left out. With a Status, it first moves into that column, as ' +
        'update_entry would.',
      inputSchema: {
        type: 'object',
        properties: {
          id: ID,
          status: STATUS,
          before: {
            type: 'integer',
            description: 'The id of the Entry to go above, in the same column. Optional.',
          },
        },
        required: ['id'],
      },
      call: (given) => {
        const id = checkId('move_entry', given['id']);
        const status =
          given['status'] === undefined ? undefined : checkStatus('move_entry', given['status']);
        const before = checkBefore(given['before']);
        if (before === id) throw badInput('move_entry cannot put an Entry above itself.');
        return told(
          within(store, () =>
            moveEntry(store, id, { status, before }, () => currentCycle(store).id),
          ),
        );
      },
    },

    {
      name: 'delete_entry',
      description: 'Take one Entry away for good, from whichever Cycle it is in.',
      inputSchema: { type: 'object', properties: { id: ID }, required: ['id'] },
      call: (given) => {
        const id = checkId('delete_entry', given['id']);
        return told(within(store, () => deleteEntry(store, id)));
      },
    },

    {
      name: 'list_notes',
      description: 'Every Note, newest first. A Note has no Status and belongs to no Cycle.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      call: () => told({ notes: listNotes(store) }),
    },

    {
      name: 'create_note',
      description: 'Keep one Note: free Markdown text that no Cycle ever moves.',
      inputSchema: {
        type: 'object',
        properties: { title: NOTE_TITLE, body: NOTE_BODY },
        required: ['body'],
      },
      call: (given) => {
        const title = checkNoteTitle('create_note', given['title']) ?? '';
        const body = checkNoteBody('create_note', given['body']);
        return told(within(store, () => createNote(store, title, body)));
      },
    },

    {
      name: 'update_note',
      description: 'Give one Note a new body, and a new title when one is given.',
      inputSchema: {
        type: 'object',
        properties: { id: NOTE_ID, title: NOTE_TITLE, body: NOTE_BODY },
        required: ['id', 'body'],
      },
      call: (given) => {
        const id = checkNoteId('update_note', given['id']);
        const title = checkNoteTitle('update_note', given['title']);
        const body = checkNoteBody('update_note', given['body']);
        return told(within(store, () => updateNote(store, id, title, body)));
      },
    },

    {
      name: 'delete_note',
      description: 'Take one Note away for good.',
      inputSchema: { type: 'object', properties: { id: NOTE_ID }, required: ['id'] },
      call: (given) => {
        const id = checkNoteId('delete_note', given['id']);
        return told(within(store, () => deleteNote(store, id)));
      },
    },

    {
      name: 'meeting_markdown',
      description:
        'The Markdown for the Meeting: a "Done" section (the Entries Done in the Cycle before ' +
        'the current one, and those already Done in the current one), an "In review" section ' +
        'when anything is In Review, and a "Working on" section (the current In Progress ' +
        'Entries, then the Todo ones).',
      inputSchema: { type: 'object', properties: {}, required: [] },
      call: () => {
        const meeting = within(store, () => meetingMarkdown(store));
        return { content: [{ type: 'text', text: meeting.markdown }], structuredContent: meeting };
      },
    },
  ];
}

/** A Cycle's id as given, or a sentence that says what an id is. */
function checkCycleId(given: unknown): number {
  if (typeof given === 'number' && Number.isSafeInteger(given) && given > 0) return given;
  throw badInput(
    `get_cycle takes "id" as the number list_cycles gives each Cycle, or leaves it out ` +
      `for the current one, and was given ${JSON.stringify(given)}.`,
  );
}

/** What update_entry was asked to change, each field checked. */
function changeOf(given: Readonly<Record<string, unknown>>): EntryChange {
  const tool = 'update_entry';
  return {
    ...(given['title'] === undefined ? {} : { title: checkTitle(tool, given['title']) }),
    ...(given['body'] === undefined ? {} : { body: checkBody(tool, given['body']) }),
    ...(given['status'] === undefined ? {} : { status: checkStatus(tool, given['status']) }),
  };
}

/** One answer, in both the shapes MCP offers, from one value. */
function told(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}
