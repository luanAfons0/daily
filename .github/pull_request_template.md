<!--
Thank you. Keep this short: one whole, working change is easier to read than a
long description of a partial one. Delete any line that does not apply.
-->

## What this changes

<!-- One or two sentences, in the project's own words. See CONTEXT.md. -->

Closes #

## Why

<!-- The problem it solves, from the side of the person who keeps the Entries. -->

## Decisions it touches

<!--
Name the ADR that covers the area you changed (docs/adr/, or FirstMate's). If
this change contradicts one, say so here and say why it is worth reopening. An
ADR that is quietly overridden is worse than one that is argued with.
-->

## Checks

- [ ] `npm test` and `npm run typecheck` both pass locally.
- [ ] New behaviour has a test in `tests/`, through `tests/helpers/plugin.ts`
      or by reading `web/` off disk, and not by importing a module of `src/`.
- [ ] A change to `web/` was tried by hand in a running FirstMate, against a
      clone that is not my real Worklog.
- [ ] `README.md` is updated, if a tool, its input or output, or an
      environment variable changed.
- [ ] A schema change is a new step at the end of `STEPS`, not an edit to one
      that shipped.
- [ ] No new dependency, nothing loaded from a CDN, and no clock.
