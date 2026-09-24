# Daily

Daily is a FirstMate Plugin. It keeps what you work on from one Meeting to the
next, and the free Notes that belong to no Meeting. It is a Plugin Server with
one SQLite file behind it, and a Plugin Page.

Read [`CONTEXT.md`](CONTEXT.md) first. It defines every word this repo uses —
Entry, Note, Status, Meeting, Cycle — and the synonyms to avoid. It borrows
FirstMate's words (Host, Plugin, Plugin Page, Plugin Server, Tool Bus, Grant,
Stopped) unchanged, from
[FirstMate's `CONTEXT.md`](https://github.com/luanAfons0/FirstMate/blob/main/CONTEXT.md).
Use those words in code, in comments, in tests, in issues and in commit
messages.

Read the ADR that covers the area you are about to change:
[`docs/adr/`](docs/adr), and FirstMate's own where the Host is involved
(0001, 0002, 0003, 0005, 0008, 0009). If your change contradicts one, say so
out loud instead of overriding it quietly.

## Commands

Run every command from the repository root.

| Command                             | What it does                               |
| ----------------------------------- | ------------------------------------------ |
| `node --test`                       | Every test. This is the whole suite.       |
| `node --test tests/entries.test.ts` | One test file, while you work on it.       |
| `npm install && npx tsc --noEmit`   | Check the types. `npm run typecheck` is the same. |
| `./mcp`                             | The Plugin Server, as the Host runs it.    |

`DAILY_NODE` names the Node that `mcp` runs, when the Host's `PATH` has none
new enough. It is the one environment variable.

`npm test` and `npm run typecheck` must both pass before you call work done.

## Tech stack

- **Node 24**, which runs TypeScript with no build step and ships
  `node:sqlite`. No bundler, no transpiler, no watcher.
- **TypeScript 5.8**, `strict`, `noUncheckedIndexedAccess`,
  `erasableSyntaxOnly`. `typescript` is a dev dependency, used only to check
  the types.
- **No runtime dependency.** MCP over stdio is the Plugin's own JSON-RPC
  (`src/mcp.ts`); the data is `node:sqlite` (ADR-0002).
- **The Page** is plain HTML, CSS and JavaScript in `web/`, served by the Host
  byte for byte (FirstMate ADR-0008). No framework, no web font, no CDN.

## Project structure

```
mcp            the executable the Host runs: find a Node 24, run src/main.ts.
src/           the Plugin Server. Every file is one job.
  main.ts      start-up: open daily.db, serve the tools.
  store.ts     daily.db: open it, move it up to the current schema version.
  cycles.ts    a Cycle: the current one, the first one started by itself, and
               start_cycle, which moves every Entry that is not Done.
  entries.ts   an Entry: add, change and delete it, and check what a caller gave.
  notes.ts     a Note: keep, change and delete it. It has no Status and no Cycle.
  tools.ts     the tools this Plugin ships, for the Page and other Plugins.
  mcp.ts       the one connection to the Host: MCP over stdio.
web/           the Plugin Page: index.html, app.css, app.js, and markdown.js,
               the small Markdown renderer it owns instead of a CDN.
tests/         one file per behaviour, plus helpers/plugin.ts.
docs/adr/      the decisions that are expensive to reverse.
docs/agents/   how an agent works in this repo. See "Agent skills" below.
```

`daily.db` is this machine's Entries and Notes, not the project's. Git ignores
it.

## Code style

- A file starts with a header comment: what this file is, then why it is that
  way. Every exported name carries a one-line `/** … */`.
- Comments say **why**, in the project's words, and name the ADR when a
  decision is behind the code (`(ADR-0001)`, `(FirstMate ADR-0009)`).
- Plain functions and object literals. No classes, no default exports, no
  inheritance, no framework.
- `readonly` on every field of an exported type. Data in, data out.
- Node built-ins carry the `node:` prefix. Local imports carry the `.ts`
  extension, because Node runs the TypeScript directly.
- Single quotes, semicolons, two-space indent, lines under 100 columns. There
  is no formatter config; match the file you are in.
- Errors are sentences a person can act on, naming the tool and the field.
  A caller's mistake is `badInput(…)`, refused as bad arguments. Fail loudly
  and early; say nothing when nothing is wrong.
- Every rule about where an Entry lives is kept in the write that changes it,
  inside one transaction (`within`), never in the Page.

## Testing

`node --test`. There are two seams, and no test imports a module of `src/`.

- **The Plugin Server**: `tests/helpers/plugin.ts` spawns the real `mcp`
  against a temporary Plugin directory and speaks to it exactly as the Host
  does. A test sees what the Host sees: JSON-RPC lines on stdout,
  diagnostics on stderr, the exit code, and `daily.db` in the directory.
- **The Page as bytes**: `tests/page.test.ts` reads `web/` off disk, because
  no test drives a browser. Keep every path relative, every asset beside the
  page, and every `byId` declared.
- A test name is a sentence about behaviour:
  `'create_entry puts the Entry in the current Cycle with the Status given'`.

## Git workflow

- Branch `main`. The remote is GitHub: `luanAfons0/daily`, so use `gh`.
- A commit subject is one imperative sentence in the project's own words, with
  no prefix, no scope and no ticket number: `Add an Entry and see it in the
  current Cycle`.
- One commit is one whole, working change: code, tests and docs together.
- Never add attribution, co-author or "generated by" lines.

## Boundaries

✅ **Always**

- Read `CONTEXT.md` and the ADRs of the area first, and use their words.
- Keep tests black-box, through the two seams.
- Update `README.md` when you change a tool, its input or output, or an
  environment variable.
- Leave `npm test` and `npm run typecheck` green.

⚠️ **Ask first**

- Any `git add`, `git commit`, `git push`, or anything that opens a PR.
- Adding a dependency of any kind.
- Changing the name, input or output of a tool: they are the contract with
  the Page, Scheduler and every Plugin with a Grant.
- A schema change to `daily.db`. It is a new step at the end of `STEPS` in
  `src/store.ts`, never an edit to a step that shipped.
- Anything that reverses an ADR.
- Anything that writes inside `~/.firstmate`, or restarts the Host.

🚫 **Never**

- Give Daily a clock. A Cycle starts when its tool is called (ADR-0001).
- Make a call to start a Cycle decide to do nothing. Every call starts one.
- Copy an Entry into a new Cycle. It moves; it is one Entry.
- Give a Note a Status or a Cycle, or move one.
- Load anything from a CDN, or name an absolute path in the Page.
- Print or commit a real `daily.db`, FirstMate's token or `runtime.json`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `luanAfons0/daily`, driven by the `gh` CLI.
See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical triage roles, each label string equal to its name. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root. See
[`docs/agents/domain.md`](docs/agents/domain.md).
