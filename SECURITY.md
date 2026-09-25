# Security

## What is at stake

Worklog runs as you, inside FirstMate, and keeps your own work notes: every
Entry and every Note you ever wrote, in one SQLite file, `worklog.db`, in its
own Plugin directory. Those notes can name customers, colleagues and
problems you would not post in public.

It shows them on the Plugin Page, and renders their Markdown with
`web/markdown.js`, a small renderer this Plugin owns. That renderer's escaping
and its link rules are the boundary between what you typed and what the Page
runs. It also answers tool calls from any Plugin that holds a Grant to it, so
another Plugin can read and change your Entries and Notes over the Tool Bus.

Bugs worth reporting privately:

- Text in a title, a body or a Note that the Page draws as markup rather than
  as text, or a link that keeps an address other than http, https, mailto or
  a relative one.
- A way to read, add, change or remove an Entry or a Note without going
  through a tool: from another Plugin's Page, from another origin, or from a
  request that FirstMate should have refused.
- A title, a body, an id or any argument that is evaluated as code or as SQL,
  or that makes the Plugin read or write outside its own directory.
- A Page that loads anything from outside the Host.
- Anything that loses Entries or Notes, or writes them anywhere but
  `worklog.db`.

## Supported versions

`main` only. Worklog is installed from its git URL, so the fix for any problem
is the next commit on `main`.

## How to report

Use GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/luanAfons0/worklog/security/advisories) of
`luanAfons0/worklog` and choose **Report a vulnerability**. That opens a private
advisory that only the maintainers can read.

Do not open a public issue for a security problem.

Please include the text or the tool call, the steps, and what an attacker gets
out of it. A patch is welcome but not expected. This is a one-maintainer
project with no service behind it and no bounty: you get an answer as soon as
the maintainer reads the advisory, and a fix on `main` once the report is
confirmed.

## Out of scope

- A Plugin you gave a Grant to Worklog doing something you did not want with
  your Entries and Notes. A Grant is your decision to trust that Plugin.
- Anything in FirstMate itself: the Host, its checks, its token or its Tool
  Bus. Report those to
  [FirstMate](https://github.com/luanAfons0/FirstMate/blob/main/SECURITY.md).
- Anything that needs an attacker who can already run commands as you, or
  read your `worklog.db`. At that point your notes are theirs anyway.
