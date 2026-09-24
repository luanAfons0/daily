/**
 * The tools this Plugin ships: one for each thing a person, the Page or
 * another Plugin can ask Daily to do. Their names are the contract between the
 * Page, Scheduler and every other Plugin with a Grant (FirstMate ADR-0009).
 *
 * Every tool answers the same data twice — as text, for whoever reads it in a
 * terminal, and as structure, for the Page, which draws it.
 */
import { currentCycle, viewOf } from './cycles.ts';
import { checkBody, checkStatus, checkTitle, createEntry, STATUSES } from './entries.ts';
import type { Tool, ToolResult } from './mcp.ts';
import { within, type Store } from './store.ts';

const TITLE = { type: 'string', description: 'One line that says what the Entry is.' };
const BODY = { type: 'string', description: 'Details, as Markdown. Optional.' };
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
  ];
}

/** One answer, in both the shapes MCP offers, from one value. */
function told(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}
