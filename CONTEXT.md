# Worklog

Worklog is a FirstMate Plugin. It keeps the things you work on between one team
meeting and the next, and the free notes that belong to no meeting.

It is a Plugin like any other, so it borrows FirstMate's words unchanged —
Host, Plugin, Plugin Page, Plugin Server, Tool Bus, Grant, Stopped. They are
defined once, in
[FirstMate's `CONTEXT.md`](https://github.com/luanAfons0/FirstMate/blob/main/CONTEXT.md),
and this file never redefines one.

## Language

**Entry**:
One thing you work on. It has a Status, a title and an optional body, and it
belongs to exactly one Cycle at a time.
_Avoid_: daily note, task, item, issue, card

**Note**:
Free text you keep. It has no Status and belongs to no Cycle, so it never
moves.
_Avoid_: memo, entry, daily note

**Status**:
Where an Entry stands: `Todo`, `In Progress`, `In Review` or `Done`, in that
order. Nothing else. `In Review` is work that is finished and waits for
someone else to look at it.
_Avoid_: state, outcome, progress

**Meeting**:
The recurring team meeting. Scheduler knows when it happens; Worklog does not.
_Avoid_: daily, standup, Team Daily

**Cycle**:
The time from one Meeting to the next. It is named by the moment it started,
because Worklog cannot know when the next Meeting will be. Every call to start a
Cycle starts one.
_Avoid_: day, period, sprint, Reporting Period

## Relationships

- An Entry that is not `Done` when a new Cycle starts moves into the new
  Cycle with its Status unchanged. It is one Entry; nothing
  is copied, and the old Cycle no longer shows it.
- An Entry that is `Done` stays in the Cycle it was in.
- An Entry that is not `Done` is always in the current Cycle. A `Done` Entry in
  an earlier Cycle that is set back to any other Status moves into the current
  Cycle at once.
- A new Entry goes into the current Cycle and nowhere else. An earlier Cycle is
  history.
- There is always a current Cycle. The first one starts by itself the first
  time Worklog needs one.
- A Note never moves.

## Flagged ambiguities

- "Daily note" was used for an Entry. It is not a kind of Note: a Note has no
  Status. Resolved: **Entry** and **Note**.
- "Daily" is the meeting in everyday speech. It is not a word for an Entry.
- The Plugin itself was called Daily, the word this file tells you to avoid
  for the Meeting, so "open Daily" could mean the Plugin Page or the Meeting.
  Resolved: the Plugin is **Worklog**, and "daily" stays on the *Avoid* list.
