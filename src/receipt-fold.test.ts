// THE RECEIPT, AS THE AUTHOR READS IT (A69-11). What the fold renders is
// arc's own record of its own run, and the words it renders it in are the
// author's — never arc's layer ids, never a status the manifest forbids.
import { describe, expect, it } from 'vitest'
import type { RouteReceipt } from 'arc-canon-graph/api-types.ts'
import {
  OLDER_ARC, intentLines, layerReadings, layerStatusWords, layerWords,
  leanedOnLine, notesHandedLine, planWords,
} from './routes-view'

const receipt = (over: Partial<RouteReceipt> = {}): RouteReceipt => ({
  run: 'run.0001',
  given: ['contract'], withheld_by_design: [], dropped_for_budget: [], runtime_added: [],
  gates: [], outcome: null, started_at: '2026-09-29T00:00:00Z', decided_at: '2026-09-29T00:01:00Z',
  ...over,
} as RouteReceipt)

describe('the layer manifest', () => {
  it('names every layer in the author\'s words, never arc\'s ids', () => {
    expect(layerWords('dramatic-condition')).toBe('What is live here')
    expect(layerWords('promoted-rules')).toBe('Your style contract')
    // A layer arc adds later still gets a row: an unnamed layer is still one
    // the author was shown, and vanishing is worse than a bare name.
    expect(layerWords('some-new-layer')).toBe('some-new-layer')
  })

  it('keeps the four statuses apart, and never says missing', () => {
    expect(layerStatusWords('given')).toBe('given to the pass')
    expect(layerStatusWords('not shown')).toContain('room ran out')
    expect(layerStatusWords('deferred')).toContain('does not read this yet')
    expect(layerStatusWords('none')).toBe('nothing here')
    for (const s of ['given', 'not shown', 'deferred', 'none']) {
      expect(layerStatusWords(s)).not.toMatch(/missing/i)
    }
  })

  it('says why a layer is not given, in the words the record recorded', () => {
    const rows = layerReadings(receipt({
      layers: [
        { layer: 'handoff', status: 'none', ids: [], because: 'this is the first scene of the book, so there is nothing behind it' },
        { layer: 'research', status: 'deferred', ids: [], because: 'research is not read yet (Q16)' },
        { layer: 'position', status: 'not shown', ids: [], because: 'room ran out' },
        { layer: 'canon', status: 'given', ids: ['char.ines'] },
      ],
    }))
    expect(rows.map(r => r.heading)).toEqual([
      'Where the last scene left the story', 'Research', 'Where the scene sits', 'The record at this moment',
    ])
    expect(rows[0].detail).toContain('the first scene of the book')
    expect(rows[1].detail).toContain('research is not read yet')
    expect(rows[2].detail).toContain('room ran out')
    // A layer that WAS given says what it carried, not why it is absent.
    expect(rows[3].detail).toContain('char.ines')
    expect(JSON.stringify(rows)).not.toMatch(/missing/i)
  })

  it('names the rung each sibling reached the pass on', () => {
    const [row] = layerReadings(receipt({
      layers: [{ layer: 'position', status: 'given', ids: ['sc.01-1'], rungs: [{ scene: 'sc.01-1', rung: 'contract' }] }],
    }))
    expect(row.detail).toContain('sc.01-1 at contract')
  })

  it('a receipt with no manifest renders no rows rather than an empty frame', () => {
    expect(layerReadings(receipt())).toEqual([])
  })
})

describe('what the run leaned on', () => {
  it('says which facts the record has not looked at lately', () => {
    expect(leanedOnLine(receipt({
      leaned_on: [{ id: 'char.ines', as_of: '1905 (year precision)', older_by_days: 1800 }],
    }))).toBe('It leans on char.ines as of 1905 (year precision) — the record has not looked since.')
  })
  it('and says nothing when the record is current', () => {
    expect(leanedOnLine(receipt())).toBeNull()
    expect(leanedOnLine(receipt({ leaned_on: [] }))).toBeNull()
  })
})

describe('the line said and the craft it became', () => {
  it('shows both, because the difference is the point', () => {
    const out = intentLines(receipt({
      intent: { said: 'more dread', plan: { moves: [{ move: 'withheld', how: 'name the wrong thing once' }] } },
    }))
    expect(out.said).toBe('You said: “more dread”')
    expect(out.plan).toBe('Writing toward: name the wrong thing once')
  })
  it('never puts a move id on the page — only what it asks for', () => {
    expect(planWords([{ move: 'narrative_distance', how: 'stay in what the body registers' }]))
      .toBe('stay in what the body registers')
    expect(planWords([{ move: 'narrative_distance', how: 'x' }])).not.toContain('narrative_distance')
  })
  it('says when the author withdrew the line, and when there was nothing to translate', () => {
    expect(intentLines(receipt({ intent: { said: 'more dread', plan: null, withdrawn: true } })).note)
      .toContain('drafted without it')
    expect(intentLines(receipt({ intent: { said: null, plan: null, note: 'nothing to translate' } })).note)
      .toContain('nothing to turn into craft')
  })
  it('and says nothing at all when the run carried no intent', () => {
    expect(intentLines(receipt())).toEqual({ said: null, plan: null, note: null })
  })
})

describe('the notes it was handed', () => {
  it('says who wrote each, because a note arc wrote is never an instruction', () => {
    expect(notesHandedLine(receipt({
      notes_handed: [{ id: 'note.001', by: 'author' }, { id: 'note.009', by: 'agent' }],
    }))).toBe('note.001, note.009 (arc’s own)')
    expect(notesHandedLine(receipt())).toBeNull()
  })
})

describe('an older arc', () => {
  it('is a label about arc, never about the prose', () => {
    expect(OLDER_ARC).toBe('written by an older arc')
    expect(OLDER_ARC).not.toMatch(/stale|out of date|invalid/i)
  })
})

describe('arc\'s own vocabulary stays off the page', () => {
  it('no layer name, status or label is a word from the machinery', () => {
    const page = [
      ...['intent', 'contract', 'handoff', 'dramatic-condition', 'canon', 'position',
        'voice', 'research', 'notes', 'promoted-rules', 'withholds', 'locks'].map(layerWords),
      ...['given', 'not shown', 'deferred', 'none'].map(layerStatusWords),
      OLDER_ARC,
    ].join(' ')
    for (const word of ['prompt', 'brief', 'agent', 'judge', 'multi-agent', 'token', 'git', 'commit', 'YAML']) {
      expect(page.toLowerCase()).not.toContain(word.toLowerCase())
    }
  })
})
