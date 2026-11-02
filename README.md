# message-times

Claude Code's main view does not show when you sent each prompt or when each
reply came. This plugin puts the time in front of each prompt and reply.

Install with one line at the Claude Code prompt (scopes, the shell form and npm
are under [Install](#install)):

```
/plugin install message-times --marketplace nightlab-agent/message-times
```

![Claude Code with the time in front of two prompts and two replies](https://raw.githubusercontent.com/nightlab-agent/message-times/330f355ff51655b7ffec73b3fe68de10b922a18f/docs/preview.png)

Claude Code's main view shows when a turn finished ("done 2:49 PM") but not
when you sent each prompt or when each reply came
([anthropics/claude-code#44763](https://github.com/anthropics/claude-code/issues/44763));
the ctrl+o view puts a time on each reply.
This plugin (it changes how Claude Code draws things) puts your
machine's local time in front of each prompt you typed and each reply, and
keeps the times in a small local file so a resumed session shows the same
ones. It changes only what is drawn. The stored message and what the model
reads stay as they were. Nothing leaves your machine.

Seen in a Claude Code 2.1.312 terminal (120 columns) on 2026-10-29. The grey
row under the first prompt is Claude Code's own notice: on that host its
built-in `cc-plugin-sec-default` guard ran first and passed the plugin's
`session.append` hook by, and the plugin noted the times from its other hooks.
On 2026-11-02 the same terminal resumed a session: the first prompt and its
reply came back with the times they had before (13:35:03 and 13:35:05).

A time from another day shows the date too: `[10-27 23:59]`.

## Install

One line at the Claude Code prompt:

```
/plugin install message-times --marketplace nightlab-agent/message-times
```

The same from a shell:

```
claude plugin install message-times --marketplace nightlab-agent/message-times
```

The same files are on npm as
[`@nightlab-agent/message-times`](https://www.npmjs.com/package/@nightlab-agent/message-times),
so a marketplace of your own can list it with
`"source": {"source": "npm", "package": "@nightlab-agent/message-times"}`.
For one run without installing, clone the repo and start Claude Code with
`--plugin-dir <path to the clone>`.

Answer `y`, then pick a scope (`user`: every project of yours; `project`:
everyone who opens this repo; `local`: this repo, only you). To remove it:
`/plugin uninstall message-times`; the times file stays until you delete
`.message-times/`.

Another way to get times: [claude-code-message-timestamps](https://github.com/zoharbabin/claude-code-message-timestamps)
(76 stars on 2026-10-29), which also tells Claude when each prompt was sent.
message-times leaves what the model reads unchanged and only draws the time.

If the times do not appear for you, open an issue with your Claude Code
version and whether you run it in a terminal, the desktop app or an editor.

## How a row gets its time

When the session keeps a prompt you typed or a reply (a row, from here on),
the plugin notes the row's id, the time and the first 160 characters of its text. When the transcript
draws a message, the plugin shows the note with the same id, or else the one
note with the same text when exactly one has it.

Prompts are also noted when you submit them, and replies when the model's
response arrives, by their text alone. That covers the case where another
plugin, loaded before this one, answers the keep-the-row event itself and
never passes it on. Seen in `-p` sessions on a machine with managed settings: the built-in
`cc-plugin-sec-default` plugin did that for some replies, and those replies
got no time. Claude Code runs that guard before the mods you install where an
organization manages Claude Code or the login is a Team or Enterprise one
([the order mods run in](https://code.claude.com/docs/en/plugins/mods/events.md#the-order-mods-run-in)). Notes of one
text made within 10 seconds of each other count as one row, as long as they
came from different places: at most one made under a row id, one made when
you sent the prompt, one made when the reply arrived. Two row ids with the
same text, two submit notes, or two notes further apart, are two rows.

Matching by text is fragile, and I have not been able to check on a real
screen whether the id Claude Code hands the drawing is the id it stored. So
the text match stays as the fallback, and the plugin never guesses a time from
when a row happened to be drawn. Some rows therefore show none:

- rows from before the plugin was installed;
- a prompt you typed with the same text as another (`yes`, twice), when its
  id matches no note: which of the two it is cannot be known;
- a prompt the session kept more than 10 seconds after you sent it (one
  typed while a turn was still running can be), when its id matches no note:
  its two notes then read as two rows;
- notifications, messages from other agents or sessions, and the summaries
  Claude Code writes when it compacts a long conversation.

In the expanded view (ctrl+o, `--verbose`) your prompts are drawn as Claude
Code draws them, since that view puts its own time on each reply. A reply made of several
blocks gets its time on the first block only.

## What it writes

One folder, `.message-times` under the project the session runs in, holding:

- `.gitignore`, one line, `*`, written before anything else, so git ignores
  the folder in every project with no step from you.
- `stamps-<session id>.tsv`, one file per session, one line per noted row
  (the newest 5000): the row id, the time, and the first 160 characters of
  what you typed or what the model answered. Each session writes only its
  own file, so two sessions open in one project never write over each
  other's notes. One session resumed in two windows at once shares one
  file; each write reads it first and keeps the other window's notes. At start a session reads the 50 most recently written notes
  files; a `stamps.tsv` left by version 0.3.4 or earlier counts as one of
  them and is never written again.

```
4b0e...-9a2c	2026-10-28T13:15:32.204Z	user:check worker status
7d11...-0f3e	2026-10-28T13:15:34.930Z	assistant:Both workers are active...
```

The third column is conversation text. The `.gitignore` keeps it out of your
commits; the files still sit on disk in plain text, so anyone with your
project folder can read them. To forget the times, end the session and delete
the folder: a running session keeps the notes in memory and writes its file
again on the next prompt. Nothing reads the files but this plugin, at the start of a session and at its first note, and you.

The folder is the plugin's one option, `dir` (set it in `/config`). A relative
path is under the project; an absolute path keeps every project's times in
one place.
The `.gitignore` is written only in a folder named `.message-times` (the
default, or an absolute path ending in it, with `/` or `\`). A folder of another name may hold
your own files (it could even be `.`), so message-times leaves git alone there:
if it is inside a project, add it to that project's `.gitignore`, since the
files hold the start of what you typed.

## What each hook does

The plugin makes no network request and sends nothing anywhere. It only reads
the events Claude Code hands it. Everything stays on your machine.

| Hook | What it does | What it changes |
|---|---|---|
| `session.start` | Reads the 50 most recently written notes files in the folder (its own and other sessions'), so a resumed session keeps its times; a session older than those gets its own back at its first new note. | Nothing. |
| `session.end` | On a `/clear`, forgets the cleared conversation's notes, so a new row saying the same thing ("yes") is never drawn with an old row's time. Any other end: nothing. | Nothing. |
| `session.append` | Notes the id and time of each kept prompt and reply (not a subagent's). | Nothing: the row is kept as Claude Code kept it. |
| `prompt.submit` | Notes the time of the prompt by its text (the fallback described above). | Nothing: the prompt goes on as typed. |
| `turn.step` (not inside a subagent) | Notes the time of the reply by its text (the same fallback). | Nothing: the request and the response pass through untouched. |
| `ui.render` (`UserMessage`, `AssistantMessage`) | Puts the time before a prompt or the first block of a reply. | The drawn row gains the time. What is stored and what is sent to the model are unchanged. |

## What it does not do

It does not time tool calls, notifications or messages from other senders.
It does not use the `timeFormat` or `timeZone` settings: times are the
machine's local 24-hour clock. It does not change what is stored or sent.

If a file cannot be read or written, the times show for this run only and
a resume has none. A failure inside the plugin draws the row as Claude Code drew
it and never changes a kept row.

## Tests

```
sh tests/release.sh
```

It needs `claude` on PATH, Python 3, TypeScript (`tsc` on PATH, or set
`TSC` to a `tsc`) and Claude Code's type declarations
(written to `.claude-plugin/types/claude-code/index.d.ts` when you start one
session with `claude --plugin-dir .` from the clone, or set `CC_TYPES` to
that file). A missing compiler or missing declarations fails the check with
what to install; it never skips.

That runs `claude plugin validate .`, `claude plugin test .` (17 tests
through the test runner Claude Code ships for plugins, with a mocked file
system), a type check
with `tsc --noEmit` against Claude Code's declarations, a checklist of rules that Anthropic's plugin directory raised on earlier
submissions of plugins like this one, and a check that the version string agrees in
plugin.json, marketplace.json, package.json and CHANGELOG.md. It exits non-zero if any step fails. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).

Nightlab on YouTube: [@NightlabBC](https://www.youtube.com/@NightlabBC).

MIT.
