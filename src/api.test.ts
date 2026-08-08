// The HTTP client: envelope unwrapping and strict error surfacing.
import { afterEach, expect, test, vi } from 'vitest'
import { acceptDraft, loadCanon, loadDocs, loadProse } from './api'

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
const fail = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => vi.unstubAllGlobals())

test('loaders unwrap their envelopes', async () => {
  vi.stubGlobal('fetch', vi.fn(() => ok({ articles: [{ path: 'docs/a.md', canon: null, body: 'x' }] })))
  expect(await loadDocs()).toHaveLength(1)

  vi.stubGlobal('fetch', vi.fn(() => ok({ scenes: [] })))
  expect(await loadProse()).toEqual([])
})

test('loaders are strict: a failing response throws the backend message', async () => {
  vi.stubGlobal('fetch', vi.fn(() => fail(500, { error: 'canon export failed — see the backend log' })))
  await expect(loadCanon()).rejects.toThrow(/canon export failed/)

  vi.stubGlobal('fetch', vi.fn(() => fail(503, { error: 'validator down' })))
  await expect(loadDocs()).rejects.toThrow(/validator down/)
})

test('a network failure propagates instead of becoming an empty story', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))))
  await expect(loadProse()).rejects.toThrow(/fetch failed/)
})

test('mutations surface the domain message from 4xx responses', async () => {
  vi.stubGlobal('fetch', vi.fn(() => fail(409, { error: 'no draft changes to accept' })))
  await expect(acceptDraft()).rejects.toThrow('no draft changes to accept')
})
