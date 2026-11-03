import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { FILES, parseFile, timeOf } from './register'

// Each session writes a notes file of its own; these tests hold the project's folder in memory, shared
// by every session a test runs in turn, so two sessions, a resume, a /clear and the FILES cap are seen
// on the files themselves.

type On = Parameters<TestBody>[1]
type $T = Parameters<TestBody>[0]

const start = ($: $T) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const prompt = ($: $T, uuid: string, text: string) =>
  $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text }] }, door: 'prompt', origin: { kind: 'composer' }, uuid })

const drawUser = ($: $T, requestId: string, text: string) =>
  $.ui.render({ surface: 'terminal', component: 'UserMessage', requestId, props: { text, origin: { kind: 'composer' }, isExpanded: false } as never })

const STAMP = /^\[\d\d:\d\d:\d\d\] /

// A folder held in memory, shared by every session the test runs in turn.
const disk = (on: On, files: Map<string, string>, session: { id: string }) => {
  // a file already there counts as written in the order the map holds it, oldest first
  let tick = 0
  const mtimes = new Map<string, number>([...files.keys()].map(f => [f, ++tick]))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/work' }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: session.id }))
  on('fs.list', (_, e) => {
    const dir = String((e as { path?: unknown }).path ?? '')
    const names = [...files.keys()].filter(f => f.startsWith(`${dir}/`)).map(f => f.slice(dir.length + 1)).filter(n => !n.includes('/'))
    return { value: names.map(name => ({ name, kind: 'file', size: 1, mtimeMs: mtimes.get(`${dir}/${name}`) ?? 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
    return { value: text }
  })
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    mtimes.set(e.path, ++tick)
    return { value: undefined }
  })
  const drawn: string[] = []
  on('ui.render', ($, e) => {
    const text = String((e.props as { text?: unknown }).text)
    drawn.push(text)
    const { Text } = $.ui.resolve(e)
    return <Text>{text}</Text>
  })
  return drawn
}

test('two sessions in one project, B writes between A\'s read and write: neither loses a note, and the next start has both', async ($, on) => {
  const files = new Map<string, string>()
  const session = { id: 's-a' }
  const drawn = disk(on, files, session)
  await start($)
  await prompt($, 'u-a1', 'from A')
  // session B writes while A is between notes, the moment that lost notes before
  files.set('/work/.message-times/stamps-s-b.tsv', 'u-b1\t2026-10-29T10:01:00.000Z\tuser:from B\n')
  await prompt($, 'u-a2', 'from A again')
  expect(Object.keys(parseFile(files.get('/work/.message-times/stamps-s-b.tsv')!))).toEqual(['u-b1'])
  expect(Object.keys(parseFile(files.get('/work/.message-times/stamps-s-a.tsv')!))).toEqual(['u-a1', 'u-a2'])
  // a third session starts and draws all three with their times
  session.id = 's-c'
  await start($)
  await drawUser($, 'u-b1', 'from B')
  await drawUser($, 'u-a2', 'from A again')
  expect(drawn[0]).toBe(`[${timeOf('2026-10-29T10:01:00.000Z', new Date())}] from B`)
  expect(drawn[1]).toMatch(STAMP)
})

test('comparison: a stamps.tsv left by an earlier version is read at start and never written again', async ($, on) => {
  const files = new Map<string, string>([['/work/.message-times/stamps.tsv', 'u-9\t2026-10-27T13:15:32.000Z\tuser:deploy the fix\n']])
  const drawn = disk(on, files, { id: 's-1' })
  await start($)
  await prompt($, 'u-1', 'new')
  await drawUser($, 'u-9', 'deploy the fix')
  expect(drawn[0]).toBe(`[${timeOf('2026-10-27T13:15:32.000Z', new Date())}] deploy the fix`)
  expect(files.get('/work/.message-times/stamps.tsv')).toBe('u-9\t2026-10-27T13:15:32.000Z\tuser:deploy the fix\n')
  expect(files.has('/work/.message-times/stamps-s-1.tsv')).toBe(true)
})

test('at start only the FILES most recently written notes files are read', async ($, on) => {
  // the first session's file is the oldest of FILES + 1
  const files = new Map<string, string>(
    Array.from({ length: FILES + 1 }, (_, i) => [`/work/.message-times/stamps-s${i}.tsv`, `u-${i}\t2026-10-29T10:00:00.000Z\tuser:row ${i}\n`] as [string, string]),
  )
  const drawn = disk(on, files, { id: 's-new' })
  await start($)
  await drawUser($, 'u-0', 'row 0')
  await drawUser($, 'u-1', 'row 1')
  expect(drawn[0]).toBe('row 0')
  expect(drawn[1]).toBe(`[${timeOf('2026-10-29T10:00:00.000Z', new Date())}] row 1`)
})

test('one session resumed in two windows: the other window writes the shared file between this one\'s notes, and its note stays', async ($, on) => {
  const files = new Map<string, string>()
  disk(on, files, { id: 's-a' })
  await start($)
  await prompt($, 'u-1', 'here')
  files.set('/work/.message-times/stamps-s-a.tsv', files.get('/work/.message-times/stamps-s-a.tsv')! + 'u-x\t2026-10-30T00:00:00.000Z\tuser:there\n')
  await prompt($, 'u-2', 'here again')
  expect(Object.keys(parseFile(files.get('/work/.message-times/stamps-s-a.tsv')!)).sort()).toEqual(['u-1', 'u-2', 'u-x'])
})

test('/clear: a row of the new conversation saying what an old one said is drawn without the old time', async ($, on) => {
  const files = new Map<string, string>()
  const session = { id: 's-a' }
  const drawn = disk(on, files, session)
  await start($)
  await prompt($, 'u-old', 'yes')
  await $.session.end({ reason: 'clear', sessionId: 's-a', resume: {} as never })
  session.id = 's-b'
  await prompt($, 'u-new', 'something new')
  await drawUser($, 'u-other', 'yes')
  await drawUser($, 'u-new', 'something new')
  expect(drawn[0]).toBe('yes')
  expect(drawn[1]).toMatch(STAMP)
  expect(Object.keys(parseFile(files.get('/work/.message-times/stamps-s-b.tsv')!))).toEqual(['u-new'])
  expect(Object.keys(parseFile(files.get('/work/.message-times/stamps-s-a.tsv')!))).toEqual(['u-old'])
})

test('comparison: a session that ends any other way keeps its notes', async ($, on) => {
  const drawn = disk(on, new Map(), { id: 's-a' })
  await start($)
  await prompt($, 'u-old', 'yes')
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's-a', resume: {} as never })
  await drawUser($, 'u-other', 'yes')
  expect(drawn[0]).toMatch(STAMP)
})
