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

The Plugin Page has three tabs: **Cycle**, **Earlier Cycles** and **Notes**.
The keys 1, 2 and 3 choose one, and N starts a new Entry.
Drag an Entry to another column to give it that Status. In a Note, Shift+Enter
saves it.

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
- When a Cycle starts, every Entry that is `Todo` or `In Progress` moves into
  it with its Status unchanged. It is the same Entry, not a copy. `Done`
  Entries stay in the Cycle they were done in.
- An Entry that is not `Done` is always in the current Cycle. Set a `Done`
  Entry in an earlier Cycle back to `Todo` or `In Progress`, and it moves into
  the current Cycle in the same write.
- Every Cycle is kept. The Page lists the earlier ones, newest first, each
  named by the moment it started; open one to see what was Done in it.
- A **Note** is free Markdown text. It has no Status and belongs to no Cycle,
  so it never moves. Notes are listed newest first.

Everything lives in one file, `daily.db`, in the Plugin directory. Git ignores
it. Daily starts empty.

## The Popup form

`web/new.html` is a small second page: choose Entry or Note, type, press
Enter. An Entry has a title, a body and a Status that starts at `Todo`; a Note
has only a body. Shift+Enter is a new line in the body. After a save the page
goes to the main Plugin Page, `./`.

It is the page a FirstMate Shortcut opens in a Popup. Going to `./` leaves
the Popup's address, so the Popup hides by itself. In a normal browser, at
`/p/daily/new.html`, it lands on the main page instead. Once the Shortcut work
lands in FirstMate, bind it with:

```sh
node src/cli.ts bind <keys> daily new.html   # in FirstMate
```

## Tools

Every tool answers its data twice: as JSON text, and as `structuredContent`.
A tool given bad input answers a JSON-RPC error with one sentence.

| Tool           | Arguments                                   | Answers                          |
| -------------- | ------------------------------------------- | -------------------------------- |
| `start_cycle`  | none                                        | one sentence, and `{ cycle, moved, said }` |
| `get_cycle`    | optional `id`                               | that Cycle, or the current one, and its Entries |
| `list_cycles`  | none                                        | `{ cycles }`, newest first, each with counts by Status |
| `create_entry` | `title`, `status`, optional `body`          | the new Entry                    |
| `update_entry` | `id`, and any of `title`, `body`, `status`  | the Entry as it now is           |
| `delete_entry` | `id`                                        | the Entry that is gone           |
| `meeting_markdown` | none                                    | the Markdown, and `{ markdown, done, workingOn }` |
| `list_notes`   | none                                        | `{ notes }`, newest first        |
| `create_note`  | `body`, `title` (optional)                  | the new Note                     |
| `update_note`  | `id`, `body`, `title` (optional)            | the Note as it now is            |
| `delete_note`  | `id`                                        | the Note that is gone            |

`start_cycle` is the tool a Scheduler Job calls at every Meeting, under a
Grant from Scheduler to Daily. Every call starts exactly one Cycle
(ADR-0001), and its text is one sentence, because a Scheduler Run keeps one:
`Started the Cycle of Tue 23 Sep 10:00 and moved 4 Entries into it.` The
moment is on the clock of the machine Daily runs on. The Page's **Prepare the
Meeting** dialog calls the same tool from its **Start a new Cycle** button,
and that dialog is the only confirmation it asks for.

`meeting_markdown` is what the **Copy for the Meeting** button in the same
dialog shows and puts on the clipboard, unchanged. It has a "Done" section — the Entries Done in the
Cycle before the current one, then those already Done in the current one — and
a "Working on" section — the current Cycle's `In Progress` Entries, then its
`Todo` ones. It lists titles only. Press it after the Meeting's `start_cycle`
has run; before, "Done" also holds what was reported last time.

Any Status may go to any other. A `body` of `null` or `""` takes the body
away. Bodies are Markdown; the Page shows them formatted with `web/markdown.js`,
a small renderer written for this Plugin, so the Page loads nothing from a CDN.

## Running it

`./mcp` is the Plugin Server, as the Host runs it: MCP over stdio. `npm test`
runs every test; `npm run typecheck` checks the types.
