import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { OwnIds, Stamp, Stamps } from '../types'

// message-times: the time on each prompt and each reply in the main conversation
// view (anthropics/claude-code#44763). The ctrl+o detail view has times of
// its own; the main view, where a long-running session is watched, has none.
//
// How a row gets its time: when the session keeps a prompt or a reply row
// (`session.append`), its id, the time and the start of its text are noted, in
// the session's state and in a file of the session's own, so a resumed session has them.
// When the conversation draws a message row it reads them and never writes (a
// render hook may not): the row whose id was noted shows that time; otherwise
// the one noted row of that kind with the same text, when exactly one has it.
// A row with no such note (one drawn from before the mod was installed, or one
// of several rows saying the same thing, however close together) shows no
// time: the mod never guesses a time from when a row happened to be drawn.
//
// A plugin seated above this one may continue past its `session.append` hook
// (the built-in cc-plugin-sec-default does on Team accounts: "runs first and
// sent the event on past it"). So a prompt is noted at `prompt.submit` too and
// a reply at `turn.step`, by text alone; notes of one text made within
// SAME_ROW_MS of each other, with at most one note from each source among
// them (one row id, one submit note, one step note), are one row, and the
// earliest is its time.
//
// DESIGN NOTE, deliberately narrow: it changes the drawing only, never the
// stored message or what the model reads; no network; every failure of its own
// is swallowed and the engine's row drawn as it was.

/** Notes kept in the session and the file, newest last. */
export const KEEP = 5000

/** Notes of one row made by two hooks sit this close together; a note further off is another row. */
export const SAME_ROW_MS = 10_000

// Change the tag when Stamp's fields change: it declines what an earlier version stored.
const stamps = atom({ plugin: 'message-times', key: 'stamps' } as const, {} as Stamps, { shape: 'stamps-1' })

const ownNotes = atom({ plugin: 'message-times', key: 'own' } as const, [] as OwnIds, { shape: 'own-1' })

/** What a row's text is matched by: its kind and its first 160 characters, spaces folded. */
export const keyOf = (kind: 'user' | 'assistant', text: string) => `${kind}:${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`

const pad = (n: number) => String(n).padStart(2, '0')

/** `09:15:32` on the day it is drawn; `10-27 09:15` on another day. Local to the machine. */
export const timeOf = (iso: string, now: Date) => {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const sameDay = t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()
  return sameDay
    ? `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    : `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

const dayOf = (t: Date) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`

/** `09:15:32`, whatever the day. Local to the machine. */
export const clockOf = (iso: string) => {
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? '' : `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

/** What a day separator names: weekday, day and month in `locale` (the runtime's when empty), the year
 * too when it is not this year's; `YYYY-MM-DD` where the runtime cannot format dates. */
export const dayLabelOf = (iso: string, now: Date, locale?: string) => {
  const t = new Date(iso)
  try {
    const year = t.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }
    return new Intl.DateTimeFormat(locale || undefined, { weekday: 'long', day: 'numeric', month: 'long', ...year }).format(t)
  } catch {
    return dayOf(t)
  }
}

/** Whether the conversation reaches past today. Only then are days separated, so a conversation held
 * within one day looks as it did, and the rows show the clock alone: the separator above says the day. */
export const spansDays = (all: Stamps, ownIds: OwnIds, now: Date) => {
  const today = dayOf(now)
  return ownIds.some(id => {
    const s = all[id]
    return s !== undefined && !Number.isNaN(new Date(s.at).getTime()) && dayOf(new Date(s.at)) !== today
  })
}

/** Whether the row noted at `at` opens its day in this conversation: no note of the conversation is
 * earlier that day, but the row's own other notes (its text, within SAME_ROW_MS). Other sessions' notes
 * do not count: they are not drawn in this conversation. */
export const opensDay = (all: Stamps, ownIds: OwnIds, at: string, key: string) => {
  const t = new Date(at).getTime()
  if (Number.isNaN(t)) return false
  const day = dayOf(new Date(t))
  return !ownIds.some(id => {
    const s = all[id]
    if (s === undefined) return false
    const n = new Date(s.at).getTime()
    if (Number.isNaN(n) || n >= t || dayOf(new Date(n)) !== day) return false
    return !(s.key === key && t - n <= SAME_ROW_MS)
  })
}

/** The newest KEEP notes, oldest first. */
export const trim = (all: Stamps): Stamps => Object.fromEntries(Object.entries(all).slice(-KEEP))

/** The file's text: one `id<TAB>iso<TAB>key` line per note. */
export const fileText = (all: Stamps) =>
  Object.entries(all)
    .map(([id, s]) => `${id}\t${s.at}\t${s.key.replace(/[\t\n]/g, ' ')}`)
    .join('\n') + '\n'

/** The notes a file holds; a line that is not `id<TAB>iso<TAB>key` is skipped. */
export const parseFile = (text: string): Stamps => {
  const out: Stamps = {}
  for (const line of text.split('\n')) {
    const [id, at, key, extra] = line.split('\t')
    if (id && at && key && extra === undefined && !Number.isNaN(new Date(at).getTime())) out[id] = { at, key }
  }
  return out
}

/** Notes ordered by their time, oldest first. */
const byTime = (all: Stamps): Stamps =>
  Object.fromEntries(Object.entries(all).sort(([, a], [, b]) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)))

/** How many notes files are read at start, the most recently written first. */
export const FILES = 50

/** A session's own file: `stamps-<session id>.tsv`. */
export const fileOf = (sessionId: string) => `stamps-${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.tsv`

/** A notes file: a session's own, or the one `stamps.tsv` versions before 0.3.5 shared. */
export const isNotes = (name: string) => name === 'stamps.tsv' || /^stamps-[A-Za-z0-9_-]+\.tsv$/.test(name)

/** A note made by text alone (at `prompt.submit` or `turn.step`), not under the row's own id. */
export const byText = (id: string) => id.startsWith('prompt:') || id.startsWith('step:')

/** Where a note came from: one row gets at most one note from each source. A row id's notes share
 * their uuid (a reply's later blocks are `uuid:1`, `uuid:2`); a prompt is noted once at submit; a reply
 * once at the step that produced it. */
const sourceOf = (id: string) => (id.startsWith('prompt:') ? 'prompt' : id.startsWith('step:') ? 'step' : `row:${id.split(':')[0]!}`)

/** The time a drawn row shows: its own id's note, else the time of the one row with its text; '' when
 * there is none, or more than one. The notes of one row all sit within SAME_ROW_MS of its first and
 * come one from each source at most: one row id, one submit note, one step note. A note further off, a
 * second row id however close ("yes" typed twice, 30 seconds apart), or a second submit note, is a
 * second row, and which of the two an unrecognized row is cannot be known. */
export const stampFor = (all: Stamps, id: string, key: string) => {
  const own = all[id]
  if (own) return own.at
  const notes = Object.entries(all)
    .filter(([, s]) => s.key === key)
    .map(([nid, s]) => ({ id: nid, t: new Date(s.at).getTime() }))
    .filter(n => !Number.isNaN(n.t))
    .sort((a, b) => a.t - b.t)
  if (notes.length === 0) return ''
  const first = notes[0]!.t
  const sources = new Set<string>()
  for (const n of notes) {
    if (n.t - first > SAME_ROW_MS) return ''
    const source = sourceOf(n.id)
    // a second note from the same source is a second row, except a reply's own later blocks
    if (sources.has(source) ? !source.startsWith('row:') : source.startsWith('row:') && [...sources].some(x => x.startsWith('row:'))) return ''
    sources.add(source)
  }
  return new Date(first).toISOString()
}

type Block = { type: string; text?: unknown }
/** The non-empty text blocks of a row, in order. */
export const textsOf = (content: unknown): string[] =>
  Array.isArray(content)
    ? (content as Block[]).filter(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '').map(b => b.text as string)
    : []

type Options = Parameters<Register>[1]

/** The folder the notes are kept in: the `dir` option, else `.message-times` under the project. */
const dirOf = (options: Options) => String(options.dir || '.message-times')

/** The folder as an absolute path: a relative one is under the session's project root, which a shell `cd`
 * does not move (a relative path given to the engine would follow the shell into a subfolder). */
const folderOf = async ($: EngineInterface, options: Options, start?: string) => {
  const dir = dirOf(options).replace(/[\\/]+$/, '')
  if (/^([\\/]|[A-Za-z]:)/.test(dir)) return dir
  // at session.start, before the engine has the session, its folder comes with the event; a host with no
  // project root keeps the folder relative, as before
  const root = (start ?? (await $.session.root().catch(() => ''))).replace(/[\\/]+$/, '')
  if (!root) return dir
  return dir === '.' ? root : `${root}/${dir.replace(/^\.[\\/]/, '')}`
}

/** Whether the folder is the mod's own, the folder its .gitignore was last written in, the write in
 * flight (notes are written one after another, so an earlier note's write never lands last), and the
 * session's own file with the notes it holds. */
type Done = { own: boolean; ignoredIn: string | null; last: Promise<void>; file: string | null; mine: Stamps }

/** Adds notes to the session's and writes the file. Before the first write in a folder it writes
 * `<dir>/.gitignore` holding `*`, so git ignores the folder in every project with no step from the user:
 * the file holds the start of what was typed and answered, and must never ride along in a commit. */
function note($: EngineInterface, options: Options, notes: Stamps, done: Done) {
  const run = done.last.catch(() => {}).then(() => write($, options, notes, done))
  done.last = run
  return run
}

async function write($: EngineInterface, options: Options, notes: Stamps, done: Done) {
  await update($, stamps, xs => trim({ ...xs, ...notes }))
  const folder = await folderOf($, options)
  if (done.own && done.ignoredIn !== folder) {
    await $.fs.write(`${folder}/.gitignore`, '*\n')
    done.ignoredIn = folder
  }
  // Each session writes a file of its own, so a second session in this project never writes over this
  // one's notes, nor this one over its: both are read at the next start.
  const name = fileOf(await $.session.id())
  const file = `${folder}/${name}`
  // Read on every write: one session resumed in two windows shares this file, and the other window's notes
  // stay. This session's own are kept here as well, so a read that lags its last write loses none of them.
  let disk: Stamps = {}
  try {
    disk = parseFile(await $.fs.read(file))
  } catch (err) {
    // a file that is there but could not be read is left alone: writing would erase its history
    const code = (err as { code?: unknown } | null)?.code
    if (code !== 'ENOENT' && (await $.fs.exists(file).catch(() => false))) throw err
  }
  if (done.file !== file) {
    done.file = file
    done.mine = {}
    // a session resumed after 50 others has its own file outside those read at start
    await update($, stamps, xs => trim(byTime({ ...disk, ...xs })))
  }
  done.mine = trim(byTime({ ...disk, ...done.mine, ...notes }))
  await update($, ownNotes, () => Object.keys(done.mine))
  await $.fs.write(`${folder}/${name}`, fileText(done.mine))
}

/** What a drawn row shows: its clock, and the day it opens when it is the first of a day in a
 * conversation that reaches past today. Null when the row has no note or the notes cannot be read. */
async function stampOf($: EngineInterface, options: Options, kind: 'user' | 'assistant', id: string, text: string) {
  try {
    const all = await read($, stamps)
    const key = keyOf(kind, text)
    const at = stampFor(all, id, key)
    if (!at) return null
    const ids = await read($, ownNotes)
    const now = new Date()
    if (!spansDays(all, ids, now)) return { at, clock: timeOf(at, now), day: null }
    return { at, clock: clockOf(at), day: opensDay(all, ids, at, key) ? dayLabelOf(at, now, String(options.locale || '')) : null }
  } catch {
    return null
  }
}

/** The earliest time among the rows on screen: the row at the top of the viewport, as rows are drawn in
 * the order they were kept. */
export const topOf = (visible: ReadonlyMap<string, string>) => {
  let top: string | null = null
  for (const at of visible.values()) if (top === null || at < top) top = at
  return top
}

/** The day the band above the prompt names: that of the top row on screen, in a conversation that
 * reaches past today. Null otherwise, or when no noted row is on screen. */
async function bandOf($: EngineInterface, options: Options, visible: ReadonlyMap<string, string>) {
  try {
    const top = topOf(visible)
    if (top === null) return null
    const now = new Date()
    if (!spansDays(await read($, stamps), await read($, ownNotes), now)) return null
    return dayLabelOf(top, now, String(options.locale || ''))
  } catch {
    return null
  }
}

/** Which noted rows are on screen, by row, with their time, and the top one's day. Kept in the module,
 * not in $.state: a render hook may not write state. */
type Viewing = { visible: Map<string, string>; topDay: string | null }

/** A row reports where it is on screen as it is drawn; the band hears of it only by a redraw, asked for
 * when the top row's day changes, so the redraw it causes finds the same day and asks for no other. */
function seen($: EngineInterface, view: Viewing, id: string, onScreen: { first: number } | null | undefined, at: string | undefined) {
  if (onScreen === undefined) return
  if (onScreen !== null && at !== undefined) view.visible.set(id, at)
  else view.visible.delete(id)
  const top = topOf(view.visible)
  const day = top === null ? null : new Date(top).toDateString()
  if (day === view.topDay) return
  view.topDay = day
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // the band keeps the day it drew until its next redraw
  }
}

export const register: Register = (on, options) => {
  // whether this session has written the folder's .gitignore yet
  // Only a folder named .message-times is the mod's own; any other may hold the user's files (even be the
  // project itself, `.`), so no .gitignore is written there.
  const own = dirOf(options).replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) === '.message-times'
  const done: Done = { own, ignoredIn: null, last: Promise.resolve(), file: null, mine: {} }

  const view: Viewing = { visible: new Map(), topDay: null }
  on('session.start', async ($, e, next) => {
    try {
      const folder = await folderOf($, options, e.cwd)
      const files = (await $.fs.list(folder))
        .filter(f => f.kind === 'file' && isNotes(f.name))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, FILES)
        .reverse()
      let kept: Stamps = {}
      for (const f of files) {
        try {
          kept = { ...kept, ...parseFile(await $.fs.read(`${folder}/${f.name}`)) }
        } catch {
          // a file that cannot be read adds nothing; the others still count
        }
      }
      await update($, stamps, xs => trim(byTime({ ...kept, ...xs })))
    } catch {
      // no folder yet, or none readable: the notes start empty
    }
    const r = await next(e)
    // the session's id is the engine's only once it has the session; a resumed one keeps its file
    try {
      const folder = await folderOf($, options, e.cwd)
      const mine = parseFile(await $.fs.read(`${folder}/${fileOf(await $.session.id())}`))
      await update($, ownNotes, () => Object.keys(mine))
    } catch {
      // a new session has no file yet; its first note fills the list
    }
    return r
  })

  // A /clear ends the conversation but not the process, and no session.start follows (the new session's
  // id comes with its first note): the old rows are gone from the screen, so their notes go too, or a
  // new row saying the same thing ("yes") could be drawn with an old one's time.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    if (e.reason === 'clear') {
      try {
        await done.last.catch(() => {})
        await update($, stamps, () => ({}))
        await update($, ownNotes, () => [])
        done.file = null
        done.mine = {}
      } catch {
        // the notes stay; a row drawn later may still find an old note
      }
    }
    return r
  })

  // A prompt or reply row is being kept: note its id, time and text.
  on('session.append', async ($, e, next) => {
    const r = await next(e)
    try {
      const m = e.message
      // a subagent's rows are not drawn in the main view, and their text must not stand for a main row's
      if (e.agentId !== undefined) return r
      const kind = e.door === 'prompt' && m.type === 'user' && !m.isMeta ? 'user' : e.door === 'response' && m.type === 'assistant' ? 'assistant' : null
      if (!kind || r.uuid === undefined) return r
      const texts = textsOf(r.message.content)
      if (texts.length === 0) return r
      const at = new Date().toISOString()
      const uuid = r.uuid
      // A prompt is one row; a reply's text blocks are each drawn as a row of their own.
      const keys = kind === 'user' ? [keyOf(kind, texts.join('\n'))] : texts.map(t => keyOf(kind, t))
      await note($, options, Object.fromEntries(keys.map((key, i) => [i === 0 ? uuid : `${uuid}:${i}`, { at, key }])), done)
    } catch {
      // this row goes unnoted; the row is kept as the engine kept it
    }
    return r
  })

  // The same prompt by its text, for when the hook above is passed by.
  on('prompt.submit', async ($, e, next) => {
    const at = new Date().toISOString()
    const r = await next(e)
    try {
      if (!e.isMeta && !e.command && 'text' in r && typeof r.text === 'string' && r.text.trim() !== '') {
        await note($, options, { [`prompt:${at}`]: { at, key: keyOf('user', r.text) } }, done)
      }
    } catch {
      // unnoted here; the prompt goes on as the engine had it
    }
    return r
  })

  // The same reply by its text, once the model's response is in (main loop only: a subagent's is not drawn there).
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    try {
      if (!e.agentId && r.answer.trim() !== '') {
        const at = new Date().toISOString()
        await note($, options, { [`step:${e.turnId}:${e.index}`]: { at, key: keyOf('assistant', r.answer) } }, done)
      }
    } catch {
      // unnoted here; the response is the engine's as streamed
    }
    return r
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // expanded (ctrl+o) the engine draws its own times; other senders' rows are left alone
    if (e.props.isExpanded || e.props.origin.kind !== 'composer') return next(e)
    const s = await stampOf($, options, 'user', e.requestId, e.props.text)
    seen($, view, e.requestId, e.props.onScreen, s?.at)
    if (!s) return next(e)
    const row = await next({ ...e, props: { ...e.props, text: `[${s.clock}] ${e.props.text}` } })
    if (!s.day) return row
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box justifyContent="center">
          <Text dimColor>{`── ${s.day} ──`}</Text>
        </Box>
        {row}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // the time goes on the block that opens a reply; a summary block is left alone
    if (e.props.isSummary || !e.props.isFirstOfReply) return next(e)
    const s = await stampOf($, options, 'assistant', e.requestId, e.props.text)
    seen($, view, e.requestId, e.props.onScreen, s?.at)
    if (!s) return next(e)
    const row = await next({ ...e, props: { ...e.props, text: `[${s.clock}] ${e.props.text}` } })
    if (!s.day) return row
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box justifyContent="center">
          <Text dimColor>{`── ${s.day} ──`}</Text>
        </Box>
        {row}
      </Box>
    )
  })

  // Only the fullscreen terminal scrolls the conversation itself and reports which rows are on screen;
  // on the main screen the terminal emulator scrolls, unseen, so the band would name a wrong day.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen !== true || e.props.hasSurvey) return next(e)
    const day = await bandOf($, options, view.visible)
    if (!day) return next(e)
    const rest = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {rest}
        <Box justifyContent="center">
          <Text dimColor>{`── ${day} ──`}</Text>
        </Box>
      </Box>
    )
  })
}
