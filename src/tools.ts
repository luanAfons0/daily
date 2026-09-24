/**
 * The tools this Plugin ships: one for each thing a person, the Page or
 * another Plugin can ask Daily to do. Their names are the contract between the
 * Page, Scheduler and every other Plugin with a Grant (FirstMate ADR-0009).
 *
 * Every tool answers the same data twice — as text, for whoever reads it in a
 * terminal, and as structure, for the Page, which draws it.
 */
import { currentCycle, viewOf } from './cycles.ts';
import {
  checkBody,
  checkId,
  checkStatus,
  checkTitle,
  createEntry,
  deleteEntry,
  STATUSES,
  updateEntry,
  type EntryChange,
} from './entries.ts';
import { badInput } from './mcp.ts';
import type { Tool, ToolResult } from './mcp.ts';
import { within, type Store } from './store.ts';

const TITLE = { type: 'string', description: 'One line that says what the Entry is.' };
const BODY = { type: 'string', description: 'Details, as Markdown. Optional.' };
const ID = { type: 'integer', description: 'The id of the Entry, from get_cycle.' };
const STATUS = { type: 'string', enum: STATUSES, description: 'Where the Entry stands.' };

/** The tools, over one open Store. */
export function toolsFor(store: Store): readonly Tool[] {
  return [
    {
      name: 'get_cycle',
      description: 'The current Cycle and every Entry in it.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      call: () => told(within(store, () => viewOf(store, currentCycle(store)))),
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
        return told(within(store, () => updateEntry(store, id, change)));
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
  ];
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
