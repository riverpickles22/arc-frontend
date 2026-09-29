import { describe, expect, it } from 'vitest'
import { ANOTHER_WAY, ASK_AGAIN, blocksAdopt, byNewest, cancelPrompt, canRewrite, chainsOf, coverageRows, droppedLabel, endingLabel, gateLine, isRouteKey, staleChip, staleLabel, lockNotice, noteLabel, notesByParagraph, overlapLabel, paragraphsOf, quoteOf, railCards, railMeta, receiptReadings, reissuedLine, routeKey, routeParagraphOf, seedLabel, standDownCount, tookLabel } from './routes-view'
import type { RouteAlternative, RouteReceipt, RunEnding } from 'arc-canon-graph/api-types.ts'

describe('coverageRows', () => {
  it('renders reported paragraphs and says "not reported" rather than guessing', () => {
    expect(coverageRows([{ item: 'A', paragraph: 2 }, { item: 'B', paragraph: null }])).toEqual([{ item: 'A', where: '¶2' }, { item: 'B', where: 'not reported' }])
  })
  it('a missing tail is no rows at all', () => { expect(coverageRows(null)).toEqual([]) })
})

describe('staleLabel', () => {
  const base = { id: 'a', scene: 'sc.01-1', seed: 's', based_on: 'b', created_at: '', body: '', briefing: '', coverage: null, overlap: null } as RouteAlternative
  it('a route an older arc wrote reads differently from one whose scene moved', () => {
    expect(staleLabel({ ...base, stale: { changed: [], why: 'written by an older arc' } })).toBe('written by an older arc')
    expect(staleLabel({ ...base, stale: { changed: ['sc.01-1'], why: 'the record moved' } })).toBe('the scene has changed since this was written')
    expect(staleLabel({ ...base, stale: { changed: ['style'], why: 'the record moved' } })).toBe('what this was written from has changed')
  })
  it('a route that still holds says nothing', () => { expect(staleLabel(base)).toBeNull() })
})

describe('staleChip', () => {
  const base = { id: 'a', scene: 'sc.01-1', seed: 's', based_on: 'b', created_at: '', body: '', briefing: '', coverage: null, overlap: null } as RouteAlternative
  it('the strip says only THAT a route is out of date — the sentence belongs to the route', () => {
    expect(staleChip({ ...base, stale: { changed: [], why: 'written by an older arc' } })).toBe('out of date')
    expect(staleChip({ ...base, stale: { changed: ['style'], why: 'the record moved' } })).toBe('out of date')
  })
  it('a route that still holds wears no marker', () => { expect(staleChip(base)).toBeNull() })
})

describe('blocksAdopt', () => {
  const base = { id: 'a', scene: 'sc.01-1', seed: 's', based_on: 'b', created_at: '', body: '', briefing: '', coverage: null, overlap: null } as RouteAlternative
  it('closes adopt on exactly what the write path refuses: a record that moved', () => {
    expect(blocksAdopt({ ...base, stale: { changed: ['style'], why: 'the record moved' } })).toBe(true)
    expect(blocksAdopt({ ...base, stale: { changed: ['sc.01-1'], why: 'the record moved' } })).toBe(true)
  })
  it('an older arc\'s route is noted, never refused — arc would still take it', () => {
    expect(blocksAdopt({ ...base, stale: { changed: [], why: 'written by an older arc' } })).toBe(false)
  })
  it('and a route that still holds is not blocked', () => { expect(blocksAdopt(base)).toBe(false) })
})

describe('cancelPrompt', () => {
  const base = { id: 'a', scene: 'sc.01-1', seed: 's', based_on: 'b', created_at: '', body: '', briefing: '', coverage: null, overlap: null } as RouteAlternative
  it('names what cancelling keeps: the author\'s own notes go to the record, not away', () => {
    expect(cancelPrompt({ ...base, notes: [{ id: 'n', paragraph: null, body: 'x', created_at: '' }] }))
      .toBe('Really cancel it? Your note on it stays on the record.')
    expect(cancelPrompt({ ...base, notes: [{ id: 'n', paragraph: null, body: 'x', created_at: '' }, { id: 'm', paragraph: 1, body: 'y', created_at: '' }] }))
      .toBe('Really cancel it? Your 2 notes on it stay on the record.')
  })
  it('and says what happens when there are none', () => {
    expect(cancelPrompt(base)).toBe('Really cancel it? The record says you let it go.')
  })
})

describe('droppedLabel', () => {
  it('says how many claims were dropped and why, where the route is', () => {
    expect(droppedLabel([{ reason: 'unresolvable', count: 1 }])).toBe('1 claim whose evidence did not resolve — dropped')
    expect(droppedLabel([{ reason: 'unresolvable', count: 3 }])).toBe('3 claims whose evidence did not resolve — dropped')
    expect(droppedLabel([{ reason: 'outside the slice', count: 1 }])).toMatch(/not asked to reach/)
    expect(droppedLabel([{ reason: 'unparseable', count: 2 }])).toMatch(/could not read/)
    expect(droppedLabel([{ reason: 'unresolvable', count: 1 }, { reason: 'unparseable', count: 1 }]))
      .toBe('1 claim whose evidence did not resolve · 1 claim arc could not read — dropped')
  })
  it('a route that dropped nothing says nothing', () => {
    expect(droppedLabel(undefined)).toBeNull()
    expect(droppedLabel([])).toBeNull()
  })
})

describe('overlapLabel', () => {
  it('names the share, and admits when it could not be measured', () => {
    expect(overlapLabel(0.25)).toBe('overlap with the current wording: 25%')
    expect(overlapLabel(null)).toMatch(/not measurable/)
  })
})

describe('lockNotice', () => {
  it('a whole-scene or chapter lock blocks the run and names the lock', () => {
    expect(lockNotice([{ id: 'lock.001', scope: 'scene', paragraph: null }]).blocked).toMatch(/lock\.001/)
    expect(lockNotice([{ id: 'lock.002', scope: 'chapter', paragraph: null }]).blocked).toMatch(/This chapter/)
  })
  it('paragraph locks constrain, with the surrounding-context warning', () => {
    const n = lockNotice([{ id: 'lock.003', scope: 'paragraph', paragraph: 1 }, { id: 'lock.004', scope: 'paragraph', paragraph: 4 }])
    expect(n.blocked).toBeNull()
    expect(n.constrain).toMatch(/¶2 \(lock\.003\), ¶5 \(lock\.004\)/)
    expect(n.constrain).toMatch(/prose around them will change/)
  })
  it('no locks, no notice', () => { expect(lockNotice([])).toEqual({ blocked: null, constrain: null }) })
})

describe('seedLabel / byNewest', () => {
  it('labels the seeds and passes unknown ones through', () => {
    expect(seedLabel('late-entry')).toBe('late entry'); expect(seedLabel('x')).toBe('x')
  })
  it('orders newest first', () => {
    const mk = (id: string, at: string) => ({ id, created_at: at } as RouteAlternative)
    expect(byNewest([mk('a', '2026-01-01'), mk('b', '2026-02-01')]).map(a => a.id)).toEqual(['b', 'a'])
  })
})

describe('chainsOf', () => {
  const mk = (id: string, at: string, revises?: string) => ({ id, created_at: at, ...(revises ? { revises } : {}) } as RouteAlternative)
  it('a rewrite folds its ancestors under it, nearest first', () => {
    const chains = chainsOf([mk('p', '2026-01-01'), mk('c', '2026-01-02', 'p'), mk('g', '2026-01-03', 'c')])
    expect(chains.map(c => c.head.id)).toEqual(['g'])
    expect(chains[0].earlier.map(a => a.id)).toEqual(['c', 'p'])
  })
  it('routes without rewrites are their own chains, newest first', () => {
    const chains = chainsOf([mk('a', '2026-01-01'), mk('b', '2026-02-01')])
    expect(chains.map(c => c.head.id)).toEqual(['b', 'a'])
    expect(chains.every(c => c.earlier.length === 0)).toBe(true)
  })
  it('a version whose parent is gone reads as a head, never an error', () => {
    const chains = chainsOf([mk('c', '2026-01-02', 'gone')])
    expect(chains.map(c => c.head.id)).toEqual(['c'])
    expect(chains[0].earlier).toEqual([])
  })
  it('two rewrites of one parent both read as heads, each carrying it', () => {
    const chains = chainsOf([mk('c2', '2026-01-03', 'p'), mk('c1', '2026-01-02', 'p'), mk('p', '2026-01-01')])
    expect(chains.map(c => c.head.id)).toEqual(['c2', 'c1'])
    expect(chains[0].earlier.map(a => a.id)).toEqual(['p'])
    expect(chains[1].earlier.map(a => a.id)).toEqual(['p'])
  })
})

describe('route notes', () => {
  const note = (id: string, paragraph: number | null, body = 'x') => ({ id, paragraph, body, created_at: '2026-08-31' })
  const withNotes = (...ns: ReturnType<typeof note>[]) => ({ id: 'a', notes: ns } as unknown as RouteAlternative)

  it('gathers notes by the paragraph they are about, and keeps whole-route notes apart', () => {
    const { whole, byParagraph } = notesByParagraph(withNotes(note('n1', 2), note('n2', null), note('n3', 2), note('n4', 5)))
    expect(whole.map(n => n.id)).toEqual(['n2'])
    expect(byParagraph.get(2)!.map(n => n.id)).toEqual(['n1', 'n3'])
    expect(byParagraph.get(5)!.map(n => n.id)).toEqual(['n4'])
    expect(byParagraph.get(9)).toBeUndefined()
  })
  it('a route with no notes gathers nothing and does not throw', () => {
    const { whole, byParagraph } = notesByParagraph({ id: 'a' } as unknown as RouteAlternative)
    expect(whole).toEqual([]); expect(byParagraph.size).toBe(0)
  })
  it('says where a note is about in the author\'s terms', () => {
    expect(noteLabel(note('n', 3))).toBe('¶3')
    expect(noteLabel(note('n', null))).toBe('the route as a whole')
  })
  it('a rewrite needs a note or a typed line — with neither it is a fresh reroute', () => {
    expect(canRewrite(withNotes(), '')).toBe(false)
    expect(canRewrite(withNotes(), '   ')).toBe(false)
    expect(canRewrite(withNotes(note('n', 1, 'sound first')), '')).toBe(true)
    expect(canRewrite(withNotes(), 'colder')).toBe(true)
    expect(canRewrite(withNotes(note('n', 1, '   ')), '')).toBe(false)
  })
})

describe('quoteOf', () => {
  const body = 'First paragraph here.\n\nSecond paragraph, the one being noted.\n\nThird.'
  it('gives the paragraph a note is about, 1-based like the stored index', () => {
    expect(quoteOf(body, 2)).toBe('Second paragraph, the one being noted.')
    expect(quoteOf(body, 1)).toBe('First paragraph here.')
  })
  it('cuts a long paragraph — the quote says where, it is not there to be reread', () => {
    const long = 'w '.repeat(300)
    expect(quoteOf(long, 1).length).toBeLessThanOrEqual(181)
    expect(quoteOf(long, 1).endsWith('…')).toBe(true)
  })
  it('a paragraph that is not there is empty, never a crash', () => {
    expect(quoteOf(body, 99)).toBe('')
    expect(quoteOf('', 1)).toBe('')
  })
})

describe('paragraphsOf', () => {
  it('splits on blank lines and trims, the one way the app splits prose', () => {
    expect(paragraphsOf('a\n\nb\n\n\nc')).toEqual(['a', 'b', 'c'])
    expect(paragraphsOf('')).toEqual([])
  })
})

describe('railCards — the one list the rail renders AND measures', () => {
  const ann = (id: string, scene: string, paragraph: number | null) => ({
    id, anchor: { scene }, resolution: { paragraph }, body: 'x',
  } as unknown as import('./canon').ResolvedAnnotation)
  const rnote = (id: string, paragraph: number | null) => ({ id, paragraph, body: 'y', created_at: '' })
  const route = (...ns: ReturnType<typeof rnote>[]) => ({ id: 'alt-1', body: 'a\n\nb', notes: ns } as unknown as RouteAlternative)

  it('with no route open it is the chapter\'s notes, in order, keyed by scene and paragraph', () => {
    const cards = railCards({ notes: [ann('n1', 'sc.1', 0), ann('n2', 'sc.2', null)], routedScene: null, route: null, composer: null })
    expect(cards.map(c => [c.kind, c.id, c.key])).toEqual([['note', 'n1', 'sc.1:0'], ['note', 'n2', null]])
  })
  it('the composer always holds index 0 — the measuring pass reads it first', () => {
    const cards = railCards({ notes: [ann('n1', 'sc.1', 0)], routedScene: null, route: null, composer: { key: 'sc.1:3' } })
    expect(cards[0].kind).toBe('composer')
    expect(cards[0].key).toBe('sc.1:3')
  })
  it('the routed scene\'s own notes stand down — their prose is not on the page', () => {
    const cards = railCards({
      notes: [ann('n1', 'sc.1', 0), ann('n2', 'sc.2', 1)],
      routedScene: 'sc.1', route: route(rnote('rnote-a', 2)), composer: null,
    })
    expect(cards.map(c => c.id)).toEqual(['n2', 'rnote-a'])
  })
  it('every other scene keeps its notes, and route notes key into their own namespace', () => {
    const cards = railCards({ notes: [ann('n2', 'sc.2', 1)], routedScene: 'sc.1', route: route(rnote('rnote-a', 2), rnote('rnote-b', null)), composer: null })
    expect(cards.map(c => c.key)).toEqual(['sc.2:1', 'route@2', 'route@0'])
  })
  it('a scene with a route open but no route selected keeps its notes', () => {
    const cards = railCards({ notes: [ann('n1', 'sc.1', 0)], routedScene: 'sc.1', route: null, composer: null })
    expect(cards.map(c => c.id)).toEqual(['n1'])
  })
})

describe('route anchor keys', () => {
  it('are colon-free, so a reading position can never read one as a scene key', () => {
    expect(routeKey(3)).toBe('route@3')
    expect(routeKey(null)).toBe('route@0')
    expect(routeKey(3).includes(':')).toBe(false)
  })
  it('round-trip, and the whole route is ¶0', () => {
    expect(routeParagraphOf(routeKey(7))).toBe(7)
    expect(routeParagraphOf(routeKey(null))).toBe(0)
    expect(isRouteKey('route@2')).toBe(true)
    expect(isRouteKey('sc.00-3:2')).toBe(false)
  })
})

describe('railMeta / standDownCount', () => {
  const ann = (scene: string) => ({ id: 'n', anchor: { scene }, resolution: { paragraph: 0 }, body: 'x' } as unknown as import('./canon').ResolvedAnnotation)
  const route = (n: number) => ({ id: 'a', body: '', notes: Array.from({ length: n }, (_, i) => ({ id: String(i), paragraph: 1, body: 'y', created_at: '' })) } as unknown as RouteAlternative)
  it('says nothing but the open count when no route is being read', () => {
    expect(railMeta({ route: null, open: 3, standDown: 0 })).toBe('3 open')
    expect(railMeta({ route: null, open: 0, standDown: 0 })).toBe('')
  })
  it('names what is on the route, what is elsewhere, and what comes back', () => {
    expect(railMeta({ route: route(2), open: 1, standDown: 3 }))
      .toBe('2 on this route · 1 elsewhere in the chapter · 3 on the scene, back when you close the route')
  })
  it('an empty route says so rather than showing a bare zero', () => {
    expect(railMeta({ route: route(0), open: 0, standDown: 0 })).toBe('none on this route yet')
  })
  it('counts only the routed scene\'s notes as standing down', () => {
    expect(standDownCount([ann('sc.1'), ann('sc.2'), ann('sc.1')], 'sc.1', route(1))).toBe(2)
    expect(standDownCount([ann('sc.1')], 'sc.1', null)).toBe(0)
  })
})

// ---- the receipt, as the author reads it (A67-11) -------------------------

describe('the receipt in the fold', () => {
  const receipt = (over: Partial<RouteReceipt> = {}): RouteReceipt => ({
    run: 'run.0001', given: ['style', 'pack'], withheld_by_design: ['the current prose of sc.02-1'],
    dropped_for_budget: [], runtime_added: [], gates: [], outcome: null,
    started_at: '2026-09-14T00:00:00Z', decided_at: '2026-09-14T00:01:00Z', ...over,
  })

  it('keeps the three readings apart, and says so when one is empty', () => {
    const rows = receiptReadings(receipt())
    expect(rows.map(r => r.heading)).toEqual(
      ['Given to the pass', 'Withheld by design', 'Dropped for room', 'Added by the runtime'])
    // An absent heading reads as "this did not happen"; "nothing was dropped"
    // is a fact the author wants to be told.
    expect(rows[2].items).toEqual([])
    expect(rows[2].empty).toMatch(/nothing was dropped/)
    expect(rows[1].items).toEqual(['the current prose of sc.02-1'])
  })

  it('never merges withheld by design with dropped for room', () => {
    const rows = receiptReadings(receipt({ withheld_by_design: ['the prose'], dropped_for_budget: ['siblings'] }))
    const withheld = rows.find(r => r.heading === 'Withheld by design')!
    const dropped = rows.find(r => r.heading === 'Dropped for room')!
    expect(withheld.items).toEqual(['the prose'])
    expect(dropped.items).toEqual(['siblings'])
  })

  it('renders a gate by what it checks, never by arc\'s id for it', () => {
    // The id is arc's vocabulary (rule 9) and the server is the one place
    // that knows the author's word for each gate, so the two can never drift
    // into two vocabularies.
    expect(gateLine({ gate: 'overlap', says: 'wording reused from the scene', verdict: 'refused', measured: 0.62, bar: 0.4, attempt: 2 }))
      .toBe('wording reused from the scene: refused — 0.62 against 0.4 (attempt 2)')
    expect(gateLine({ gate: 'leak', says: 'the scene\u2019s own prose kept out of the brief', verdict: 'held', attempt: 1 }))
      .toBe('the scene\u2019s own prose kept out of the brief: held')
    // An older receipt with no `says` still reads, rather than rendering
    // nothing where the gate's name should be.
    expect(gateLine({ gate: 'locks', says: '', verdict: 'held', attempt: 1 })).toBe('locks: held')
  })

  it('says how a run ended in the author\'s words, and has a word for every ending', () => {
    const endings: RunEnding[] = ['landed', 'refused', 'could not run', 'timed out', 'budget', 'unreadable', 'cancelled', 'unfinished']
    for (const e of endings) {
      expect(endingLabel(e), e).not.toBe('still open')
      expect(endingLabel(e), e).not.toContain(e === 'landed' ? 'zzz' : '_')
    }
    expect(endingLabel(undefined)).toBe('still open')
    expect(endingLabel('cancelled')).toBe('you stopped it')
  })

  it('says how long it took the way a person says it, and nothing at all when it cannot', () => {
    expect(tookLabel(1000)).toBe('1 second')
    expect(tookLabel(41_000)).toBe('41 seconds')
    expect(tookLabel(60_000)).toBe('1 minute')
    expect(tookLabel(138_000)).toBe('2.3 minutes')
    expect(tookLabel(undefined)).toBe(null)
    expect(tookLabel(Number.NaN)).toBe(null)
  })
})

// The two gestures sit next to each other and do opposite things, so the
// words that tell them apart are held here rather than in the markup (A69-13).
describe('ask again, beside another way through', () => {
  it('says which one replaces and which one adds, in the author\'s words', () => {
    expect(ASK_AGAIN).toMatch(/replaced by what comes back/)
    expect(ASK_AGAIN).toMatch(/as it stands now/)
    expect(ANOTHER_WAY).toMatch(/beside the ones already here/)
    // Neither sentence may reach for arc's own vocabulary (rule 9).
    for (const line of [ASK_AGAIN, ANOTHER_WAY]) {
      expect(line).not.toMatch(/\b(run|receipt|row|slice|pass|prompt|agent)\b/i)
    }
  })

  it('the fold says a route was a second asking, and whether the one it replaced left a record', () => {
    expect(reissuedLine({})).toBeNull()
    expect(reissuedLine({ reissued: true, reissued_from: 'run.0007' })).toMatch(/asked again/)
    expect(reissuedLine({ reissued: true, reissued_from: 'run.0007' })).not.toMatch(/run\.0007/)
    expect(reissuedLine({ reissued: true })).toMatch(/older arc/)
  })
})
