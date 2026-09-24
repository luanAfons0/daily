# A Cycle starts when Scheduler says so

Daily has no clock. It does not know when the Meeting is, so it cannot know
when a Cycle ends. A Cycle starts when its tool is called, and a Scheduler Job
calls it at the Meeting time, under a Grant from Scheduler to Daily. Every call
starts one Cycle, so a Late Run or a person pressing "Start a new Cycle" does
the same thing, and the tool never decides to do nothing.

## Considered Options

A Meeting time kept in Daily, with a timer in its Plugin Server. That is a
second clock beside Scheduler's, which is what FirstMate ADR-0004 moved out of
the Host so that one Plugin could own it. Two clocks disagree on Late, on Grace
and on what happens while the Host is off.

A Cycle computed from the date when it is read, with no event at all. It needs
Daily to know the Meeting time, so it is the first option again.

## Consequences

A Cycle is named by the moment it started, never by the Meeting that will end
it, because that Meeting is not known yet.

If no Scheduler Job calls the tool, the current Cycle simply stays open. That
is not an error, and Daily says nothing about it.
