# Daily keeps its data in SQLite

Daily keeps every Cycle it ever had, and reading history back means questions
across Cycles: what was Done in this one, which Entries moved through three.
It keeps its data in one SQLite file, `daily.db`, in its own directory and
ignored by git, through `node:sqlite`, which is built into Node 24. Scheduler
keeps JSON files; Daily does not, because its history is queried, not read
whole.

## Consequences

Daily takes no dependency for this. It needs Node 24 or newer, which its `mcp`
wrapper finds the way Scheduler's does, because the Host's service PATH holds
only an older Node.
