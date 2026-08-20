// Pins the draft layer's diff behavior before and after the refactor.
import { expect, test } from 'vitest'
import { diffProse, diffStats } from './diff'

test('identical bodies diff to all-same paragraphs', () => {
  const d = diffProse('One para.\n\nTwo para.', 'One para.\n\nTwo para.')
  expect(d.map(p => p.kind)).toEqual(['same', 'same'])
  expect(diffStats(d)).toEqual({ ins: 0, del: 0 })
})

test('a changed paragraph pairs positionally and diffs word by word', () => {
  const d = diffProse('The quick brown fox.\n\nStable.', 'The slow brown fox.\n\nStable.')
  expect(d[0].kind).toBe('changed')
  const kinds = d[0].pieces!.map(p => [p.kind, p.text])
  expect(kinds).toContainEqual(['del', 'quick'])
  expect(kinds).toContainEqual(['ins', 'slow'])
  expect(d[1].kind).toBe('same')
  expect(diffStats(d)).toEqual({ ins: 1, del: 1 })
})

test('added and removed paragraphs stay whole', () => {
  const d = diffProse('Keep.', 'Keep.\n\nBrand new paragraph here.')
  expect(d.map(p => p.kind)).toEqual(['same', 'ins'])
  expect(diffStats(d).ins).toBe(4)

  const d2 = diffProse('Keep.\n\nDoomed paragraph.', 'Keep.')
  expect(d2.map(p => p.kind)).toEqual(['same', 'del'])
  expect(diffStats(d2).del).toBe(2)
})

test('empty main means everything is an insertion (new scene)', () => {
  const d = diffProse('', 'A wholly new scene.\n\nTwo paragraphs.')
  expect(d.every(p => p.kind === 'ins')).toBe(true)
})

test('unpaired extra paragraphs after a changed run keep their own kind', () => {
  const d = diffProse('Alpha one.\n\nBeta.', 'Alpha two.\n\nGamma extra.\n\nBeta.')
  expect(d[0].kind).toBe('changed')
  expect(d.find(p => p.kind === 'ins')?.text).toBe('Gamma extra.')
  expect(d[d.length - 1].kind).toBe('same')
})

// ---- the identity the paragraph verbs travel by -------------------------

test('every paragraph carries the identity the server merges against', () => {
  const d = diffProse('A.\n\nB.\n\nC.', 'A.\n\nNEW.\n\nB.\n\nC.')
  expect(d.map(p => [p.kind, p.mainIndex, p.draftIndex])).toEqual([
    ['same', 0, 0],
    ['ins', null, 1],
    ['same', 1, 2],
    ['same', 2, 3],
  ])
})

test('an inserted paragraph reports a draft index that is not its main index', () => {
  const d = diffProse('A.\n\nB.', 'A.\n\nNEW.\n\nB.')
  const ins = d.find(p => p.kind === 'ins')!
  expect(ins.draftIndex).toBe(1)
  expect(ins.mainIndex).toBeNull()
  // B moved in the draft but not in the book — the disagreement that made a
  // bare index unsafe to send.
  const b = d.find(p => p.kind === 'same' && p.mainIndex === 1)!
  expect(b.draftIndex).toBe(2)
})

test('a deleted paragraph keeps a main-side identity, so it can be judged', () => {
  const d = diffProse('A.\n\nB.\n\nC.', 'A.\n\nC.')
  const del = d.find(p => p.kind === 'del')!
  expect(del.mainIndex).toBe(1)
  expect(del.draftIndex).toBeNull()
  expect(del.text).toBe('B.')
})

test('a rewritten paragraph carries both sides', () => {
  const d = diffProse('A.\n\nB was this.', 'A.\n\nB is now this.')
  const changed = d.find(p => p.kind === 'changed')!
  expect(changed.mainIndex).toBe(1)
  expect(changed.draftIndex).toBe(1)
})
