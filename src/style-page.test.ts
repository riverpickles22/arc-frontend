import { expect, test } from 'vitest'
import { checklistOf, ruleCount, sectionOf, sectionsOf, touchstonesOf } from './style-page'

// Shaped like the real feral-dogs docs/style.md.
const CONTRACT = `# The Feral Dogs of Cuba — Prose Style Guide

> Governs the manuscript.

## 1. The contract

- **POV.** Close third on Carlos.
- **Tense.** Past, throughout.

## 2. Sensory order: smell first

- Openings lead with smell.

## 6. Touchstones

**Slow time (smell-first opening) — from ch-00/scene-01:**

> For nine days the sea had smelled only of itself.

**A wrong version, annotated — do not write this:**

> He gazed at Havana glowing in the distance.

## 7. Pre-draft checklist

1. Does the scene open on smell? (§2)
2. Does any sentence interpret or explain? (§1)
3. Does any word postdate the scene's year? (§4)

## Open questions

- Spanish usage policy.
`

test('sections are listed with anchors that match the rendered headings', () => {
  const s = sectionsOf(CONTRACT)
  expect(s.map(x => x.title)).toEqual([
    '1. The contract', '2. Sensory order: smell first', '6. Touchstones',
    '7. Pre-draft checklist', 'Open questions',
  ])
  expect(s[0].slug).toBe('1-the-contract')
})

test('the checklist reads as discrete items — the gate, not a paragraph', () => {
  expect(checklistOf(CONTRACT)).toEqual([
    'Does the scene open on smell? (§2)',
    'Does any sentence interpret or explain? (§1)',
    "Does any word postdate the scene's year? (§4)",
  ])
})

test('touchstone labels are extracted, including the annotated wrong version', () => {
  expect(touchstonesOf(CONTRACT)).toEqual([
    'Slow time (smell-first opening) — from ch-00/scene-01:',
    'A wrong version, annotated — do not write this:',
  ])
})

test('rule count skips touchstones, checklist and open questions', () => {
  expect(ruleCount(CONTRACT)).toBe(3)   // 2 in §1, 1 in §2 — not the open question
})

test('a contract that follows no template still reads — fewer affordances, no crash', () => {
  const loose = '# My voice\n\nShort sentences. No semicolons.\n'
  expect(sectionsOf(loose)).toEqual([])
  expect(checklistOf(loose)).toEqual([])
  expect(touchstonesOf(loose)).toEqual([])
  expect(ruleCount(loose)).toBe(0)
  expect(sectionOf(loose, /anything/)).toBeNull()
})
