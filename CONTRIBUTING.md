# Contributing to Daily

Daily is a FirstMate Plugin that keeps what you work on from one Meeting to
the next, and the free Notes that belong to no Meeting. It holds a person's
own work notes, and the Meeting is read from them in front of a team, so a
mistake here loses somebody's week or shows it wrong in public.

## Read these first

- [`CONTEXT.md`](CONTEXT.md) defines every word this repo uses — Entry, Note,
  Status, Meeting, Cycle — and the synonyms to avoid. The FirstMate words it
  borrows (Host, Plugin, Plugin Page, Plugin Server, Tool Bus, Grant, Stopped)
  are defined in
  [FirstMate's `CONTEXT.md`](https://github.com/luanAfons0/FirstMate/blob/main/CONTEXT.md).
  Use these words in code, in comments, in tests, in issues and in commit
  messages.
- [`docs/adr/`](docs/adr) holds the decisions that are expensive to reverse:
  why a Cycle starts when Scheduler says so, and why the data is in SQLite.
  Read the ADR that covers the area you are about to change, and FirstMate's
  own where the Host is involved. If your change contradicts one, say so in
  the pull request instead of overriding it quietly.
- [`AGENTS.md`](AGENTS.md) is the same ground in short form, for coding
  agents.

## What you need

Node 24 or newer, npm and Git. Node 24 runs the TypeScript directly, so there
is nothing to build, and it ships `node:sqlite`, where Daily keeps its data
(ADR-0002). For changes to the Page, a running
[FirstMate](https://github.com/luanAfons0/FirstMate) too.

Daily is developed and tested on Linux and on WSL Debian, where FirstMate
runs. macOS and native Windows are untried rather than unsupported. If you run
it there, open an issue with what breaks.

## Get the code

```bash
git clone https://github.com/luanAfons0/daily.git
cd daily
npm install
npm test
```

Run every command from the repository root.

## Run the tests

```bash
npm test            # node --test: every test
npm run typecheck   # tsc --noEmit
```

Both must pass. The `Check` workflow runs both on `ubuntu-latest` for every
pull request.

There are two test seams, and **no test imports a module of `src/`**. That is
what lets the whole inside of this Plugin be rewritten without touching a
test.

- **The Plugin Server.** `tests/helpers/plugin.ts` spawns the real `mcp`
  against a temporary Plugin directory and speaks MCP to it exactly as the
  Host does. A test sees what the Host sees: JSON-RPC lines on stdout,
  diagnostics on stderr, the exit code, and `daily.db` in the directory.
- **The Page as bytes.** `tests/page.test.ts` and `tests/markdown.test.ts`
  read `web/` off disk, because no test drives a browser. Keep every path
  relative, every asset beside the page, and every `byId` declared.

A test name is a sentence about behaviour, not about code:
`'create_entry puts the Entry in the current Cycle with the Status given'`.

## Try a change by hand, safely

Never point a half-finished change at your real Entries and Notes. The Plugin
keeps `daily.db` in the directory it runs in, so register a clone that is not
the directory your real Daily runs from:

1. Install FirstMate: <https://github.com/luanAfons0/FirstMate>.
2. From the FirstMate repository, register your clone:
   `node src/cli.ts add daily-dev /absolute/path/to/your/clone`.
3. Restart the Host and open `http://127.0.0.1:4747/p/daily-dev/`.

The Host serves `web/` from the clone you registered, so an edit to the Page
is one reload away. A change to `src/` needs the Host restarted, because the
Host starts a Plugin Server once and never again on its own. When you are
done, `node src/cli.ts remove daily-dev` and delete the clone's `daily.db`.

## How the code is written

- A file starts with a header comment: what it is, then why it is that way.
  Every exported name carries a one-line `/** … */`.
- Plain functions and object literals. No classes, no default exports, no
  framework, `readonly` on every field of an exported type.
- Single quotes, semicolons, two-space indent, lines under 100 columns. There
  is no formatter; match the file you are in.
- **No new dependencies**, at runtime or for development, without an issue
  first. The Page loads nothing from a CDN.
- Comments say **why**, in the project's words, and name the ADR when a
  decision is behind the code (`(ADR-0001)`, `(FirstMate ADR-0009)`).
- Errors are sentences a person can act on, naming the tool and the field.
  Fail early and loudly; say nothing when nothing is wrong.

Properties that a change may not weaken, however good the reason looks:

- **Daily has no clock.** A Cycle starts when its tool is called, and every
  call starts one (ADR-0001).
- An Entry moves into a new Cycle; it is never copied.
- An Entry that is not `Done` is always in the current Cycle.
- A Note has no Status and no Cycle, and never moves.
- Every rule about where an Entry lives is kept in the write that changes it,
  inside one transaction, never in the Page.
- A schema change is a new step at the end of `STEPS` in `src/store.ts`, never
  an edit to a step that shipped.
- The Markdown renderer escapes every character before it reads any Markdown,
  and a link keeps only an http, https, mailto or relative address.

## Commits

One imperative sentence in the project's own words, with no prefix, no scope
and no ticket number, the way FirstMate writes them:

```
Add an Entry and see it in the current Cycle
Present the Meeting and set the order of each column
```

One commit is one whole, working change: code, tests and docs together. No
attribution, co-author or "generated by" lines.

## Pull requests

1. Branch from `main`. Name it after the issue: `issue-20-open-to-the-public`.
2. Leave `npm test` and `npm run typecheck` green.
3. Update `README.md` when you change a tool, its input or output, or an
   environment variable.
4. Open the pull request with `gh pr create --base main`, and write
   `Closes #<issue>` in the body.
5. Say in the description which ADR covers what you changed, and whether you
   contradict one.

Small, obvious fixes do not need an issue first. Anything that changes the
name, input or output of a tool, the schema of `daily.db`, or one of the
properties above does: open an issue and let it be discussed before you write
the code. A tool is the contract with the Page, with Scheduler and with every
Plugin that holds a Grant.

## Issues

Issues live in GitHub Issues for `luanAfons0/daily`. A bug report is most
useful with the tool call and its answer, or what the Page showed, and the
`daily:` lines from the journal. Never attach your `daily.db`.

Triage uses five labels: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human` and `wontfix`. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md). A new issue
gets `needs-triage` and a maintainer sorts it from there.

Security problems do not belong in an issue. See [`SECURITY.md`](SECURITY.md).
