# Daily

A FirstMate Plugin that keeps what you work on from one Meeting to the next,
and the free Notes that belong to no Meeting.

Read [`CONTEXT.md`](CONTEXT.md) for the words this project uses — Entry, Note,
Status, Meeting, Cycle — and [`docs/adr/`](docs/adr) for why a Cycle starts
when Scheduler says so and why the data is in SQLite.

## Install it

Register the directory where it lives, and restart the Host:

```sh
node src/cli.ts add daily /absolute/path/to/daily   # in FirstMate
systemctl --user restart firstmate
```

Then open the Index Page, find `daily`, and open its Plugin Page.

It needs Node 24 or newer, for TypeScript with no build step and for
`node:sqlite`. The Host's service `PATH` often has only an older Node, so `mcp`
looks for one in this order: `DAILY_NODE`, `node` on `PATH`, then every Node
under nvm. With none, it says so in one sentence and the Plugin is Stopped.

## What it keeps

- An **Entry** is one thing you work on: a title, an optional Markdown body,
  and a Status — `Todo`, `In Progress` or `Done`.
- A **Cycle** is the time from one Meeting to the next, named by the moment it
  started. A new Entry goes into the current Cycle. The first Cycle starts by
  itself the first time Daily needs one.
- A **Note** is free Markdown text. It has no Status and belongs to no Cycle,
  so it never moves. Notes are listed newest first.

Everything lives in one file, `daily.db`, in the Plugin directory. Git ignores
it. Daily starts empty.

## Tools

Every tool answers its data twice: as JSON text, and as `structuredContent`.
A tool given bad input answers a JSON-RPC error with one sentence.

| Tool           | Arguments                                   | Answers                          |
| -------------- | ------------------------------------------- | -------------------------------- |
| `get_cycle`    | none                                        | the current Cycle and its Entries |
| `create_entry` | `title`, `status`, optional `body`          | the new Entry                    |
| `update_entry` | `id`, and any of `title`, `body`, `status`  | the Entry as it now is           |
| `delete_entry` | `id`                                        | the Entry that is gone           |
| `list_notes`   | none                                        | `{ notes }`, newest first        |
| `create_note`  | `body`                                      | the new Note                     |
| `update_note`  | `id`, `body`                                | the Note as it now is            |
| `delete_note`  | `id`                                        | the Note that is gone            |

Any Status may go to any other. A `body` of `null` or `""` takes the body
away. Bodies are Markdown; the Page shows them formatted with `web/markdown.js`,
a small renderer written for this Plugin, so the Page loads nothing from a CDN.

## Running it

`./mcp` is the Plugin Server, as the Host runs it: MCP over stdio. `npm test`
runs every test; `npm run typecheck` checks the types.
