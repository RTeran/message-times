# Changelog

The form is Keep a Changelog; versions follow SemVer.

## Unreleased

### Docs
- README: seen on a real screen that a resumed session keeps each prompt's and reply's time
  (Claude Code 2.1.312, 120 columns, 2026-11-02); until now only the tests showed it.

## 0.3.6 - 2026-11-02

### Docs
- README: Claude Code's main view does show when a turn finished; the README now says what it
  leaves out (when you sent each prompt and when each reply came) instead of "no time", and that
  the ctrl+o view times each reply (code.claude.com, interactive mode).

### Tests
- A prompt's submit note written after the row's own note: a row found by its text still
  shows the earlier time. No change to the code.

## 0.3.5 - 2026-10-30

### Fixed
- Two sessions open in one project could lose notes: when one wrote `stamps.tsv` between the other's read
  and write, the later write dropped the first one's new notes. Each session now writes a file of its own,
  `stamps-<session id>.tsv`, and a session reads the 50 most recently written ones at start. A
  `stamps.tsv` from an earlier version is still read while it is among those 50, and is no longer written.
- After a `/clear`, a new row saying what an old one said ("yes") could be drawn with the old row's time:
  the notes of the cleared conversation stayed in memory. A `/clear` now drops them.

## 0.3.4 - 2026-10-30

### Fixed
- A `stamps.tsv` that exists but could not be read (a lock, a refused read) is left alone. Before, the mod
  took it for a missing file and rewrote it with this session's notes only, erasing the others.
- Two notes in one session are written one after the other, so an earlier note's write can no longer land
  last and drop the later note from the file.
- A relative `dir` (the default `.message-times` included) is now resolved against the session's
  project root, which a shell `cd` does not move (`/cd` and a worktree move do). Each folder the notes are written in gets its `.gitignore`
  first. Before, the path was relative to the session's working directory.

## 0.3.3 - 2026-10-29

### Fixed
- The mod writes its `.gitignore` only in a folder named `.message-times`: with the `dir` option set to `.`,
  it replaced the project's own `.gitignore` with `*`. The default folder still gets its `.gitignore`.

### Changed
- CHANGELOG: an older line named the creator in a form he does not use; it says xnfinite.

## 0.3.2 - 2026-10-29

### Fixed
- Two sessions in one project no longer erase each other's times: before each write the file on disk is read
  and merged, newest 5000 kept. A test covers a note another session wrote after this one started.

### Changed
- README: the picture's address is the full GitHub one, so the npm page shows it too.
- README: a picture from a Claude Code 2.1.312 terminal and the notice it showed; scopes; how to uninstall;
  the other timestamps plugin named. The repo's notes say what they mean in plain words.

## 0.3.1 - 2026-10-29 - two rows with one text never share a time

### Fixed
- A row drawn under an id the mod had not noted took the time of the notes with its text when they sat within a
  minute of each other, even when they were two rows kept under two ids ("yes" typed twice, 30 seconds apart). Now
  the notes of one row must sit within 10 seconds of its first (a limit chosen by hand, not measured) and come
  one from each source at most: one row id (a reply's blocks share their row's), one submit note, one reply
  note; anything else is a second row, and the drawn row gets no time rather than the wrong one. Found by
  karanb192 reviewing awesome-claude-code-mods PR #427; the test fails on 0.3.0.
- A subagent's kept rows are no longer noted: one with the same text as a main row could have stood for it.

### Changed
- `tsconfig.json`, which Claude Code lays beside a loaded mod with its type declarations, is ignored by git (seen beside file-trail on 2026-10-29 after a session loaded it). `tests/typecheck.sh` tells tsc to ignore such an untracked file: tsc 7.0.2 stopped on it with error TS5112.

## 0.3.0 - 2026-10-29 - the notes folder is kept out of git

### Added
- Before its first write in a session the mod writes `<dir>/.gitignore` holding one line, `*`, so git ignores the notes
  folder in every project with no step from you. `stamps.tsv` holds the first 160 characters of each prompt and reply,
  and until now nothing kept a user from committing it with the project (found by an outside review, 2026-10-29).
- A test for it, which failed before the change.

### Changed
- README rewritten in plain words: what it draws, how to install it, what it writes and how to delete it. It no longer
  carries a version history (this file does), and no longer advertises other products.
- README says plainly that matching a drawn row to its note by text is fragile, and why the text match is still there.
- `tests/release.sh` checks the version string in four files (the README no longer carries one).

## 0.2.2 - 2026-10-28 - the README names the kit

### Added
- README: a Build your own section names the free template (mod-ready) and a paid kit.

## 0.2.1 - 2026-10-28 - the release script type-checks

### Changed
- README: the one-line install now sits under the README's first paragraph, with a link to the full Install section.
- package.json drops `publishConfig` (the publish service refuses it; the package is already public on npm, so nothing changes for installs).
- The checklist fails (was: warns) on a `publishConfig` in package.json, and fails on a package.json repository that is not the plugin's own GitHub repo.
- `tests/typecheck.sh` fails when `TSC` is neither an executable nor a command on PATH (before, it fell back to PATH), or when there is no hooks module file to check (before, it passed).
- The release script type-checks the hooks module, its tests and the state contract with `tsc --noEmit` against the
  engine's own declarations (`tests/typecheck.sh`, the compiler options the declarations' header gives a hooks module).
  No `tsc` or no declarations fails the release script; it never skips.

### Fixed
- The module named a type `Engine` that `claude-code` does not export, so the functions using it went unchecked; it now names `EngineInterface`. No behaviour change.

## 0.2.0 - 2026-10-28 - the notes folder is an option

### Changed
- `stamps.tsv` goes to the `dir` option (default `.message-times`, under the project; set it in `/config`).
  It was `$MESSAGE_TIMES_DIR`, else `~/.message-times`: set `dir` to the absolute path of the old folder to keep its times.
- The module reads no environment variable and writes only under that folder. An environment read and a write path
  built from it are what held another mod in the plugin directory's review.

## 0.1.6 - 2026-10-28 - plugin.json links the repo

### Changed
- `plugin.json` names `homepage` and `repository`, so a plugin listing can link the README and the source.
- package.json `files` lists only paths that exist (the empty `types/` entry is gone).

## 0.1.5 - 2026-10-28 - credits the agent's creator

### Changed
- README: the credit line names the agent's creator, xnfinite. package.json author is `Nightlab`.

## 0.1.4 - 2026-10-28 - says what each hook does, and that nothing leaves the machine

### Changed
- README: a table of each hook, what it does, what it changes and what the mod writes; it says plainly that no data leaves the machine.
- plugin.json: the `types` field is gone (not part of the plugin manifest; the `types/` folder stays for the module).

## 0.1.3 - 2026-10-28

### Added
- `package.json`: the plugin is published to npm as `@nightlab-agent/message-times` (plugin files only, no scripts), so a marketplace can install it from an npm source.
- The release script's version check reads `package.json` too (five files).

## 0.1.2 - 2026-10-28

### Fixed
- The 0.1.1 note overstated what was seen. Read again on 2026-10-28, `cc-plugin-sec-default` passed by both hooks for some replies and neither for the rest: of 8 replies, 5 got no note and 3 got both the row note and the `turn.step` note. Every unnoted reply was about this mod's own hooks; the exact trigger is not known. The first test session's replies were mostly of that kind, which is why it saw so few. The README now says so; no code changed.

## 0.1.1 - 2026-10-28

### Fixed
- Replies drew no time where a plugin seated above this one passes by its `session.append` hook. Seen live on 2026-10-28: the built-in `cc-plugin-sec-default` (Team accounts) "runs first and sent the event on past it", so the session's opening prompt was noted and none of the replies were. Prompts are now also noted at `prompt.submit` and replies at `turn.step` (main loop only), by their text.
- Notes of one text made within 60 seconds of each other are one row, and the earliest is its time, so a row noted by two hooks still draws. Two rows with one text further apart still draw none.
- 10 tests (2 new). A mutation dropping the `turn.step` note fails 1; one dropping the 60-second merge fails 3.

## 0.1.0 - 2026-10-28

### Added
- A `session.append` hook on prompt and reply rows: the row's id, the time and the first 160 characters of its text, noted in the session's state and in `$MESSAGE_TIMES_DIR/stamps.tsv`, else `$HOME/.message-times/stamps.tsv` (newest 5000).
- `ui.render` hooks on `UserMessage` (your own prompts, collapsed view) and `AssistantMessage` (the block opening a reply): the time in front of the text, from the note with the row's id, else the one note with its text. Render hooks only read.
- 8 tests under the engine's test kit; release script `tests/release.sh` (validate, test, version string in four files). A mutation dropping the duplicate-text check fails 1; one dropping the expanded check fails 1.
