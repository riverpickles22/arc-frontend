// THE DRAFTING BAR'S THREE STATES (A69-11). The property under test is the
// one the plan step exists for: between saying something and settling it,
// NOTHING IS WRITTEN — so which answer is a plan, and what the second press
// sends, are the two things that must not drift.
import { describe, expect, it } from 'vitest'
import type { DraftSceneResponse } from 'arc-canon-graph/api-types.ts'
import { editClause, planToSend, readDraftAnswer, saysSomething } from './drafting-bar'

const MOVES = [
  { move: 'narrative_distance', how: 'stay in what the body registers' },
  { move: 'withheld', how: 'name the wrong thing once, and never explain it' },
]
const res = (over: Partial<DraftSceneResponse> = {}): DraftSceneResponse =>
  ({ reply: '', actions: [], file: null, ...over } as DraftSceneResponse)

describe('which answer is a plan to read', () => {
  it('a plan with no prose is the reading — the author reads one line and nothing was written', () => {
    expect(readDraftAnswer(res({ plan: { moves: MOVES }, run: 'run.0001' })))
      .toEqual({ step: 'plan', moves: MOVES })
  })

  it('a plan AND a file is a draft that landed, never a step that never comes', () => {
    // The second call answers with both: the craft it ran on, and the scene
    // it wrote. Reading that as a plan would hide the draft behind a
    // question the author has already answered.
    expect(readDraftAnswer(res({ plan: { moves: MOVES }, file: 'prose/ch-01/scene-02.md' })).step)
      .toBe('drafted')
  })

  it('no plan at all is a draft — an engine with no reading still drafts', () => {
    expect(readDraftAnswer(res({ file: 'prose/ch-01/scene-02.md' })).step).toBe('drafted')
    expect(readDraftAnswer(res({ plan: { moves: [] } })).step).toBe('drafted')
  })
})

describe('whether there is anything to translate', () => {
  it('a line said now gets a plan; nothing said drafts at once', () => {
    expect(saysSomething('more dread')).toBe(true)
    expect(saysSomething('')).toBe(false)
    expect(saysSomething('   ')).toBe(false)
  })
})

describe('what go and drop send', () => {
  it('go sends the craft as it stands, edited or not', () => {
    expect(planToSend({ moves: MOVES }, true)).toEqual({ moves: MOVES })
    const edited = editClause(MOVES, 0, 'closer still')
    expect(planToSend({ moves: edited }, true)?.moves[0].how).toBe('closer still')
  })

  it('drop sends null — the line is withdrawn, not forgotten', () => {
    // null is its own request state: the pass runs without the craft, and
    // the record still carries what the author said (A69-4).
    expect(planToSend({ moves: MOVES }, false)).toBeNull()
  })

  it('and a plan with nothing in it is not a plan', () => {
    expect(planToSend({ moves: [] }, true)).toBeNull()
    expect(planToSend(null, true)).toBeNull()
  })
})

describe('editing a clause', () => {
  it('changes what the pass is told and never what was asked for', () => {
    const out = editClause(MOVES, 1, 'say it twice')
    expect(out[1]).toEqual({ move: 'withheld', how: 'say it twice' })
    // THE MOVE IDS ARE THE RECORD. Editing the page must not rewrite them,
    // or two plans a year apart stop being comparable.
    expect(out.map(m => m.move)).toEqual(MOVES.map(m => m.move))
    expect(MOVES[1].how).toBe('name the wrong thing once, and never explain it')
  })

  it('leaves every other clause exactly as it was', () => {
    expect(editClause(MOVES, 0, 'x')[1]).toEqual(MOVES[1])
    expect(editClause(MOVES, 9, 'x')).toEqual(MOVES)
  })
})

// ONE LINE, THREE PASSES (A69-11, criterion 1). The drafting bar has one
// input, and the author who types in it means the same thing whichever
// button they press next. Three fields fed from three places would drift
// the moment one of them changed, so this reads the view itself: every pass
// launched from the bar must take the line from the same state.
describe('the line the author typed', () => {
  it('reaches the draft, the redraft and another way through — all from one field', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const src = fs.readFileSync(
      url.fileURLToPath(new URL('./components/ManuscriptView.tsx', import.meta.url)), 'utf8')

    // The reroute has always had it; the redraft is what this card added.
    expect(src).toMatch(/rerouteScene\(\{[^}]*guidance: guidance\.trim\(\)/)
    expect(src).toMatch(/const line = guidance\.trim\(\)/)
    // And nothing else is read for a pass's guidance: a second source of
    // "what the author said" is how two passes get told different things.
    const sends = [...src.matchAll(/guidance: ([A-Za-z.()' ]+?)[,}]/g)].map(m => m[1].trim())
    for (const s of sends) {
      expect(['line', "guidance.trim()", 'guidance']).toContain(s)
    }
  })
})

// A PLAN IS MADE FOR ONE PLACE (A69-11 review, finding 1). The bar's plan
// survives a click into another chapter, and `go` used to read whatever was
// open at the moment it was pressed — so a plan made for chapter 3 could
// write chapter 7's next scene with chapter 3's craft. The target carries
// the chapter, and the view drops the plan when the author leaves.
describe('what go runs', () => {
  it('names the chapter the plan was made for, never the one now open', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const src = fs.readFileSync(
      url.fileURLToPath(new URL('./components/ManuscriptView.tsx', import.meta.url)), 'utf8')

    // The target records it at the moment the plan comes back...
    expect(src).toMatch(/target: \{ kind: 'draft', chapter: cur\.id \}/)
    // ...and settling reads it from there, not from `cur`.
    expect(src).toMatch(/draftNow\(plan\.target\.chapter, plan\.said, settled\)/)
    // ...and leaving the chapter takes the plan with it.
    expect(src).toMatch(/const gotoChapter[\s\S]{0,600}setPlan\(null\)/)
  })
})
