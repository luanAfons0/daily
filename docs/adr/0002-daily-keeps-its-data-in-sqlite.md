# Daily keeps its data in SQLite

Daily keeps every Cycle it ever had, and reading history back means questions
across Cycles: what was Done in this one, which Entries moved through three.
It keeps its data in one SQLite file, `worklog.db`, in its own directory and
ignored by git, through `node:sqlite`, which is built into Node 24. Scheduler
keeps JSON files; Daily does not, because its history is queried, not read
whole.

## Consequences

Daily takes no dependency for this. It needs Node 24 or newer, which its `mcp`
wrapper finds the way Scheduler's does, because the Host's service PATH holds
only an older Node.

The file was `daily.db` before the Plugin was renamed. Start-up renames an old
`daily.db`, and the files SQLite keeps beside it, to `worklog.db` before it
opens anything. That is a rename and not a schema step, because the content
does not change.
