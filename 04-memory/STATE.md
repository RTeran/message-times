# State

- Created 2026-10-28 for anthropics/claude-code#44763.
- v0.1.0: `session.append` notes, `ui.render` on `UserMessage` and `AssistantMessage`, file under `MESSAGE_TIMES_DIR` else `$HOME/.message-times/stamps.tsv`; types contract; 8 tests; two mutations each fail 1; release check `tests/release.sh`.
- v0.1.2: docs only. The pass-by is per reply, not host-wide: of 8 replies, 5 got no note from either hook (all about this mod's hooks; trigger not known), 3 got both. The fallback never rescued a one-hook pass-by here.
- v0.1.1: a live session on a Team host had its `session.append` hook passed by the built-in `cc-plugin-sec-default` (opening prompt noted, no reply). Fallback notes at `prompt.submit` and `turn.step` (main loop), by text; notes of one text within 60 s are one row. 10 tests; mutations fail 1 and 3.
- Open: whether a message row's render `requestId` equals the stored row's `uuid` on a real host. The typings say only "the message id". The text match covers rows whose text is unique either way.
- Icon is file-trail's until one is drawn. Seen in a Claude Code 2.1.312 terminal on 2026-10-29: times on prompts and replies (desktop app not yet seen).
