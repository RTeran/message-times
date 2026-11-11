import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { byText, clockOf, dayLabelOf, fileText, KEEP, keyOf, opensDay, parseFile, spansDays, stampFor, timeOf, trim } from './register'

// Each test stands for the engine beneath the plugin: it answers
// `session.start`, `$.fs.read` and `$.fs.write`, keeps the rows
// the session appends, and draws a message row by handing back the text the
// plugin passed down. Nothing touches the real file system.

type On = Parameters<TestBody>[1]
// the test runtime has timers; the declarations the mod builds against do not name them
declare const setTimeout: (f: () => void, ms: number) => unknown
type $T = Parameters<TestBody>[0]

const world = (on: On, opts: { file?: string; readFails?: boolean; writeFails?: boolean} = {}) => {
  const writes: { path: string; text: string }[] = []
  const drawn: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-1' }))
  on('fs.list', () => ({ value: opts.file === undefined ? [] : [{ name: 'stamps.tsv', kind: 'file', size: 1, mtimeMs: 1, isLink: false }] }))
  on('fs.read', () => {
    if (opts.readFails || opts.file === undefined) throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
    return { value: opts.file }
  })
  on('fs.write', (_, e) => {
    if (opts.writeFails) throw new Error('read-only file system')
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const text = String((e.props as { text?: unknown }).text)
    drawn.push(text)
    const { Text } = $.ui.resolve(e)
    return <Text>{text}</Text>
  })
  return { writes, drawn }
}

const start = ($: $T) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const prompt = ($: $T, uuid: string, text: string) =>
  $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text }] }, door: 'prompt', origin: { kind: 'composer' }, uuid })

const reply = ($: $T, uuid: string, ...texts: string[]) =>
  $.session.append({
    message: { type: 'assistant', role: 'assistant', content: texts.map(text => ({ type: 'text' as const, text })) },
    door: 'response',
    origin: { kind: 'model', model: 'claude-test' },
    uuid,
  })

const drawUser = ($: $T, requestId: string, text: string, extra: Record<string, unknown> = {}) =>
  $.ui.render({ surface: 'terminal', component: 'UserMessage', requestId, props: { text, origin: { kind: 'composer' }, isExpanded: false, ...extra } as never })

const drawReply = ($: $T, requestId: string, text: string, extra: Record<string, unknown> = {}) =>
  $.ui.render({ surface: 'terminal', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true, ...extra } as never })

const STAMP = /^\[\d\d:\d\d:\d\d\] /

const submit = ($: $T, text: string, extra: Record<string, unknown> = {}) => $.prompt.submit({ text, ...extra } as never)

const step = async ($: $T, turnId: string, index: number, extra: Record<string, unknown> = {}) => {
  const s = $.turn.step({ turnId, index, model: 'claude-test', messageCount: 1, ...extra } as never)
  for await (const _ of s) {
    // the chunks are the engine's; only the result is read
  }
  return s.result
}

// What the engine beneath answers when asked: the prompt as typed, and a response with one text.
const engine = (on: On, answer: string) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
}

test('a prompt and a reply the session kept are drawn with the time, by id or by their text', async ($, on) => {
  const { writes, drawn } = world(on)
  await start($)
  await prompt($, 'u-1', 'check worker status')
  await reply($, 'a-1', 'Both workers are active.')
  await drawUser($, 'u-1', 'check worker status')
  await drawReply($, 'msg_other_id', 'Both workers are active.')
  expect(drawn[0]).toMatch(STAMP)
  expect(drawn[0]).toEndWith('] check worker status')
  expect(drawn[1]).toMatch(STAMP)
  expect(drawn[1]).toEndWith('] Both workers are active.')
  expect(writes.at(-1)!.path.endsWith('/.message-times/stamps-s-1.tsv')).toBe(true)
  expect(Object.keys(parseFile(writes.at(-1)!.text))).toEqual(['u-1', 'a-1'])
})

test('with session.append passed by, a prompt and a reply are noted at prompt.submit and turn.step and drawn with the time', async ($, on) => {
  const { writes, drawn } = world(on)
  engine(on, 'All four workers are up.')
  await start($)
  await submit($, 'check worker status')
  await step($, 't-1', 0)
  await drawUser($, 'r-1', 'check worker status')
  await drawReply($, 'r-2', 'All four workers are up.')
  expect(drawn[0]).toMatch(STAMP)
  expect(drawn[1]).toMatch(STAMP)
  expect(writes.at(-1)!.text).toContain('step:t-1:0\t')
})

test('a row noted by both doors draws one time; a subagent step, a meta prompt and a tool-only step are not noted', async ($, on) => {
  const { writes, drawn } = world(on)
  engine(on, '')
  await start($)
  await submit($, 'check worker status')
  await prompt($, 'u-1', 'check worker status')
  await drawUser($, 'r-9', 'check worker status')
  expect(drawn[0]).toMatch(STAMP)
  const before = writes.length
  await step($, 't-1', 0)
  await step($, 't-2', 0, { agentId: 'a-1' })
  await submit($, 'hidden', { isMeta: true })
  expect(writes.length).toBe(before)
})

test('a resumed session reads the times from the file', async ($, on) => {
  const file = 'u-9\t2026-10-27T13:15:32.000Z\tuser:deploy the fix\n'
  const { drawn } = world(on, { file })
  await start($)
  const tree = await drawUser($, 'u-9', 'deploy the fix')
  expect(drawn[0]).toBe(`[${clockOf('2026-10-27T13:15:32.000Z')}] deploy the fix`)
  expect(JSON.stringify(tree)).toContain(`── ${dayLabelOf('2026-10-27T13:15:32.000Z', new Date())} ──`)
})

test('a conversation held within today draws no day separator and keeps the plain time', async ($, on) => {
  const { drawn } = world(on)
  await start($)
  await prompt($, 'u-1', 'check worker status')
  const tree = await drawUser($, 'u-1', 'check worker status')
  expect(drawn[0]).toMatch(STAMP)
  expect(JSON.stringify(tree)).not.toContain('──')
})

test('a resumed conversation from another day: its first row of each day opens a separator, the rest do not', async ($, on) => {
  const file = [
    'u-1\t2026-10-27T09:00:00.000Z\tuser:first of the day',
    'a-1\t2026-10-27T09:00:20.000Z\tassistant:answer to it',
    'u-2\t2026-10-28T09:00:00.000Z\tuser:next day',
  ].join('\n') + '\n'
  world(on, { file })
  await start($)
  const first = await drawUser($, 'u-1', 'first of the day')
  const answer = await drawReply($, 'a-1', 'answer to it')
  const next = await drawUser($, 'u-2', 'next day')
  expect(JSON.stringify(first)).toContain(`── ${dayLabelOf('2026-10-27T09:00:00.000Z', new Date())} ──`)
  expect(JSON.stringify(answer)).not.toContain('──')
  expect(JSON.stringify(next)).toContain(`── ${dayLabelOf('2026-10-28T09:00:00.000Z', new Date())} ──`)
})

test('helpers: days are opened among this conversation\'s notes only, a row\'s own earlier note aside', () => {
  const all = {
    'other-session': { at: '2026-10-27T08:00:00.000Z', key: 'user:elsewhere' },
    'prompt:x': { at: '2026-10-27T09:00:00.000Z', key: 'user:hello' },
    'u-1': { at: '2026-10-27T09:00:00.300Z', key: 'user:hello' },
    'u-2': { at: '2026-10-27T10:00:00.000Z', key: 'user:later' },
  }
  const ownIds = ['prompt:x', 'u-1', 'u-2']
  expect(opensDay(all, ownIds, '2026-10-27T09:00:00.300Z', 'user:hello')).toBe(true)
  expect(opensDay(all, ownIds, '2026-10-27T10:00:00.000Z', 'user:later')).toBe(false)
  expect(opensDay(all, [...ownIds, 'other-session'], '2026-10-27T09:00:00.300Z', 'user:hello')).toBe(false)
  expect(spansDays(all, ownIds, new Date('2026-10-27T12:00:00.000Z'))).toBe(false)
  expect(spansDays(all, ownIds, new Date('2026-10-29T12:00:00.000Z'))).toBe(true)
  expect(spansDays(all, [], new Date('2026-10-29T12:00:00.000Z'))).toBe(false)
})

const band = ($: $T, isFullscreen: boolean | undefined) =>
  $.ui.render({
    surface: 'terminal',
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10 } as never,
    viewport: { columns: 80, rows: 40, ...(isFullscreen === undefined ? {} : { isFullscreen }) },
  } as never)

const twoDays = [
  'u-1\t2026-10-27T09:00:00.000Z\tuser:first day',
  'u-2\t2026-10-28T09:00:00.000Z\tuser:second day',
].join('\n') + '\n'

test('fullscreen: the band above the prompt names the day of the top row on screen, and follows a scroll', async ($, on) => {
  world(on, { file: twoDays })
  await start($)
  const first = dayLabelOf('2026-10-27T09:00:00.000Z', new Date())
  const second = dayLabelOf('2026-10-28T09:00:00.000Z', new Date())
  await drawUser($, 'u-1', 'first day', { onScreen: { first: 0, last: 2, of: 3 } })
  await drawUser($, 'u-2', 'second day', { onScreen: { first: 0, last: 2, of: 3 } })
  expect(JSON.stringify(await band($, true))).toContain(`── ${first} ──`)
  await drawUser($, 'u-1', 'first day', { onScreen: null })
  const after = JSON.stringify(await band($, true))
  expect(after).toContain(`── ${second} ──`)
  expect(after).not.toContain(first)
})

test('the band is not drawn off fullscreen, where the size does not say, or in a conversation held within today', async ($, on) => {
  world(on, { file: twoDays })
  await start($)
  await drawUser($, 'u-1', 'first day', { onScreen: { first: 0, last: 2, of: 3 } })
  expect(JSON.stringify(await band($, false))).not.toContain('──')
  expect(JSON.stringify(await band($, undefined))).not.toContain('──')
})

test('comparison: in a conversation held within today the fullscreen band stays empty', async ($, on) => {
  world(on)
  await start($)
  await prompt($, 'u-1', 'check worker status')
  await drawUser($, 'u-1', 'check worker status', { onScreen: { first: 0, last: 2, of: 3 } })
  expect(JSON.stringify(await band($, true))).not.toContain('──')
})

test('helpers: the day label follows the locale and names the year only when it is not this year\'s', () => {
  const now = new Date('2026-11-11T12:00:00')
  expect(dayLabelOf('2026-11-10T12:00:00', now, 'es-ES')).toBe('martes, 10 de noviembre')
  expect(dayLabelOf('2025-11-10T12:00:00', now, 'es-ES')).toContain('2025')
  expect(dayLabelOf('2026-11-10T12:00:00', now, 'en-GB')).toBe('Tuesday 10 November')
})

test('a row with no note, or one of two rows with the same text and other ids, is drawn without a time', async ($, on) => {
  const old = new Date(Date.now() - 2 * 3600_000).toISOString()
  const { drawn } = world(on, { file: `u-1\t${old}\t${keyOf('user', 'check worker status')}\n` })
  await start($)
  await prompt($, 'u-2', 'check worker status')
  await drawUser($, 'r-1', 'check worker status')
  await drawUser($, 'r-0', 'something typed before the mod was installed')
  await drawUser($, 'u-2', 'check worker status')
  expect(drawn[0]).toBe('check worker status')
  expect(drawn[1]).toBe('something typed before the mod was installed')
  expect(drawn[2]).toMatch(STAMP)
})

test('the expanded view, a message from another sender, a reply block after the first and a summary are left alone', async ($, on) => {
  const { drawn } = world(on)
  await start($)
  await prompt($, 'u-1', 'hello')
  await reply($, 'a-1', 'one', 'two')
  await drawUser($, 'u-1', 'hello', { isExpanded: true })
  await drawUser($, 'u-1', 'hello', { origin: { kind: 'unclassified' } })
  await drawReply($, 'a-1:1', 'two', { isFirstOfReply: false })
  await drawReply($, 'a-1', 'one', { isSummary: true })
  expect(drawn).toEqual(['hello', 'hello', 'two', 'one'])
})

test('meta rows, tool results and empty replies are not noted', async ($, on) => {
  const { writes } = world(on)
  await start($)
  await $.session.append({ message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: 'reminder' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid: 'm-1' })
  await reply($, 'a-1')
  expect(writes.length).toBe(0)
})

test('a file that cannot be read or written costs the file alone: rows are kept and still drawn with the time', async ($, on) => {
  const { writes, drawn } = world(on, { readFails: true, writeFails: true })
  await start($)
  const r = await prompt($, 'u-1', 'still works')
  expect(r.uuid).toBe('u-1')
  await drawUser($, 'u-1', 'still works')
  expect(writes.length).toBe(0)
  expect(drawn[0]).toMatch(STAMP)
})

test('the dir option moves the file', { options: { dir: '/var/notes' } }, async ($, on) => {
  const { writes } = world(on)
  await start($)
  await prompt($, 'u-1', 'a')
  expect(writes.map(w => w.path)).toEqual(['/var/notes/stamps-s-1.tsv'])
})

test('with dir set to the project itself, the project\'s own .gitignore is left alone', { options: { dir: '.' } }, async ($, on) => {
  const { writes } = world(on)
  await start($)
  await prompt($, 'u-1', 'a')
  expect(writes.filter(w => w.path.endsWith('.gitignore')).length).toBe(0)
  expect(writes.filter(w => w.path.endsWith('stamps-s-1.tsv')).length).toBe(1)
})

test('comparison: an absolute folder named .message-times gets its .gitignore', { options: { dir: '/var/notes/.message-times/' } }, async ($, on) => {
  const { writes } = world(on)
  await start($)
  await prompt($, 'u-1', 'a')
  expect(writes[0]!.path.endsWith('/.message-times/.gitignore')).toBe(true)
})

test('helpers: time on another day shows the date; the file keeps the newest KEEP; bad lines are skipped', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0)
  expect(timeOf(new Date(2026, 9, 28, 9, 5, 7).toISOString(), now)).toBe('09:05:07')
  expect(timeOf(new Date(2026, 9, 27, 23, 59, 0).toISOString(), now)).toBe('10-27 23:59')
  expect(timeOf('not a time', now)).toBe('')
  const many = Object.fromEntries(Array.from({ length: KEEP + 3 }, (_, i) => [`id-${i}`, { at: '2026-10-28T00:00:00.000Z', key: `user:${i}` }]))
  const kept = trim(many)
  expect(Object.keys(kept).length).toBe(KEEP)
  expect(Object.keys(kept)[0]).toBe('id-3')
  expect(parseFile('x\t2026-10-28T00:00:00Z\tuser:a\nbroken line\ny\tnot-a-date\tuser:b\n')).toEqual({ x: { at: '2026-10-28T00:00:00Z', key: 'user:a' } })
  expect(parseFile(fileText({ a: { at: '2026-10-28T00:00:00Z', key: 'user:tab\there' } }))).toEqual({ a: { at: '2026-10-28T00:00:00Z', key: 'user:tab here' } })
  expect(keyOf('user', '  check\n worker   status ')).toBe('user:check worker status')
  expect(stampFor({}, 'x', 'user:a')).toBe('')
})

test('before its first write the mod writes <dir>/.gitignore holding one line, *, once, so git never sees the folder', async ($, on) => {
  const { writes } = world(on)
  await start($)
  await prompt($, 'u-1', 'first')
  await prompt($, 'u-2', 'second')
  expect(writes[0]!.path.endsWith('/.message-times/.gitignore')).toBe(true)
  expect(writes[0]!.text).toBe('*\n')
  expect(writes.filter(w => w.path.endsWith('/.gitignore')).length).toBe(1)
  expect(writes.filter(w => w.path.endsWith('/stamps-s-1.tsv')).length).toBe(2)
})

test('"yes" kept twice under two ids 30 seconds apart: a row not under either id gets no time; each own row keeps its own', async ($, on) => {
  const earlier = new Date(Date.now() - 30_000).toISOString()
  const { drawn } = world(on, { file: `u-1\t${earlier}\t${keyOf('user', 'yes')}\n` })
  await start($)
  await prompt($, 'u-2', 'yes')
  await drawUser($, 'r-unknown', 'yes')
  await drawUser($, 'u-1', 'yes')
  await drawUser($, 'u-2', 'yes')
  expect(drawn[0]).toBe('yes')
  expect(drawn[1]).toBe(`[${timeOf(earlier, new Date())}] yes`)
  expect(drawn[2]).toMatch(STAMP)
})

test('control: one row noted by its text at submit and under its id a second later is one row, and a row drawn under another id gets its time', async ($, on) => {
  const earlier = new Date(Date.now() - 1_000).toISOString()
  const { drawn } = world(on, { file: `prompt:${earlier}\t${earlier}\t${keyOf('user', 'yes')}\n` })
  await start($)
  await prompt($, 'u-1', 'yes')
  await drawUser($, 'r-unknown', 'yes')
  expect(drawn[0]).toBe(`[${timeOf(earlier, new Date())}] yes`)
})

test('"yes" noted by text alone 30 seconds ago (its keep passed by) and "yes" kept now under an id are two rows: an unrecognized row gets no time', async ($, on) => {
  const earlier = new Date(Date.now() - 30_000).toISOString()
  const { drawn } = world(on, { file: `prompt:${earlier}\t${earlier}\t${keyOf('user', 'yes')}\n` })
  engine(on, '')
  await start($)
  await submit($, 'yes')
  await prompt($, 'u-2', 'yes')
  await drawUser($, 'r-unknown', 'yes')
  await drawUser($, 'u-2', 'yes')
  expect(drawn[0]).toBe('yes')
  expect(drawn[1]).toMatch(STAMP)
})

test('stampFor: two row ids or two submit notes refuse, however close; one row id with text notes answers; text notes alone answer; byText names the text-only ids', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 29, 9, 0, s)).toISOString()
  const key = 'user:yes'
  expect(stampFor({ 'u-1': { at: at(0), key }, 'u-2': { at: at(30), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'u-1': { at: at(0), key }, 'u-2': { at: at(1), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'u-1': { at: at(0), key }, 'prompt:x': { at: at(1), key }, 'u-2': { at: at(30), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'prompt:x': { at: at(0), key }, 'u-1': { at: at(3), key } }, 'r', key)).toBe(at(0))
  expect(stampFor({ 'prompt:x': { at: at(0), key }, 'u-1': { at: at(30), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'prompt:x': { at: at(0), key }, 'step:t:0': { at: at(5), key } }, 'r', key)).toBe(at(0))
  expect(stampFor({ 'prompt:x': { at: at(0), key }, 'prompt:y': { at: at(30), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'prompt:x': { at: at(0), key }, 'prompt:y': { at: at(8), key } }, 'r', key)).toBe('')
  expect(stampFor({ 'step:t:0': { at: at(0), key: 'assistant:Done.' }, 'step:u:0': { at: at(4), key: 'assistant:Done.' } }, 'r', 'assistant:Done.')).toBe('')
  expect(stampFor({ 'step:t:0': { at: at(0), key: 'assistant:Done.' }, 'a-1': { at: at(1), key: 'assistant:Done.' } }, 'r', 'assistant:Done.')).toBe(at(0))
  expect(stampFor({ 'a-1': { at: at(0), key: 'assistant:same' }, 'a-1:1': { at: at(0), key: 'assistant:same' } }, 'r', 'assistant:same')).toBe(at(0))
  expect(byText('prompt:2026')).toBe(true)
  expect(byText('step:t-1:0')).toBe(true)
  expect(byText('u-1')).toBe(false)
})

test('"yes" sent twice 8 seconds apart with both keeps passed by: two rows noted by text alone, and an unrecognized row gets no time', async ($, on) => {
  const earlier = new Date(Date.now() - 8_000).toISOString()
  const { drawn } = world(on, { file: `prompt:${earlier}\t${earlier}\t${keyOf('user', 'yes')}\n` })
  engine(on, '')
  await start($)
  await submit($, 'yes')
  await drawUser($, 'r-unknown', 'yes')
  expect(drawn[0]).toBe('yes')
})

test('a subagent\'s kept rows are not noted, so a main reply with the same text keeps its own time', async ($, on) => {
  const { writes, drawn } = world(on)
  await start($)
  await reply($, 'a-1', 'Done.')
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    door: 'response',
    origin: { kind: 'model', model: 'claude-test' },
    uuid: 's-1',
    agentId: 'agent-1',
  } as never)
  expect(Object.keys(parseFile(writes.at(-1)!.text))).toEqual(['a-1'])
  await drawReply($, 'r-unknown', 'Done.')
  expect(drawn[0]).toMatch(STAMP)
})

test('a notes file that is there but whose read is refused (EBUSY) is left alone, not rewritten with this session\'s notes', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  let refuse = false
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-1' }))
  on('fs.list', () => ({ value: [{ name: 'stamps-s-1.tsv', kind: 'file', size: 1, mtimeMs: 1, isLink: false }] }))
  on('fs.read', () => {
    if (refuse) throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' })
    return { value: 'u-1\t2026-10-29T10:00:00.000Z\tuser:first\n' }
  })
  on('fs.exists', () => ({ value: true }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  await start($)
  refuse = true
  await prompt($, 'u-3', 'today')
  expect(writes.filter(w => w.path.endsWith('stamps-s-1.tsv')).length).toBe(0)
})

test('comparison: with no file yet, the first note writes the file', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-1' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => {
    throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
  })
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  await start($)
  await prompt($, 'u-3', 'today')
  expect(writes.filter(w => w.path.endsWith('stamps-s-1.tsv')).at(-1)!.text).toContain('u-3\t')
})

test('one session, two notes at once, the first one\'s write answered late: the file still ends with both', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  let first = true
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's-1' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => {
    throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
  })
  on('fs.write', async (_, e) => {
    if (e.path.endsWith('stamps-s-1.tsv') && first) {
      first = false
      await new Promise<void>(r => setTimeout(() => r(), 50))
    }
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  await start($)
  await Promise.all([prompt($, 'u-1', 'first'), prompt($, 'u-2', 'second')])
  const last = writes.filter(w => w.path.endsWith('stamps-s-1.tsv')).at(-1)!.text
  expect(last).toContain('u-1\t')
  expect(last).toContain('u-2\t')
})

// Out of order: the submit note's time is taken before the prompt goes on, but it can be written
// after the row's own note. A row found by its text shows the earliest time either way.
test('out of order: a submit note written after the row\'s own note still gives the earlier time', () => {
  const key = keyOf('user', 'fix the build')
  const late = { u1: { at: '2026-10-31T22:00:03.000Z', key }, 'prompt:2026-10-31T22:00:00.000Z': { at: '2026-10-31T22:00:00.000Z', key } }
  expect(stampFor(late, 'other-id', key)).toBe('2026-10-31T22:00:00.000Z')
  expect(stampFor(late, 'u1', key)).toBe('2026-10-31T22:00:03.000Z')
})

test('comparison: the same two notes written in time order give the same answers', () => {
  const key = keyOf('user', 'fix the build')
  const inOrder = { 'prompt:2026-10-31T22:00:00.000Z': { at: '2026-10-31T22:00:00.000Z', key }, u1: { at: '2026-10-31T22:00:03.000Z', key } }
  expect(stampFor(inOrder, 'other-id', key)).toBe('2026-10-31T22:00:00.000Z')
  expect(stampFor(inOrder, 'u1', key)).toBe('2026-10-31T22:00:03.000Z')
})
