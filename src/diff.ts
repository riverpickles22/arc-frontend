// Prose diff for the draft layer: paragraphs first, then words within
// changed paragraph pairs.
//
// The LCS itself lives in arc-canon-graph (diff-seq.ts), not here: A37-3 needs
// the same alignment on the server, where the sentence decision is applied to
// the author's file. Two implementations would be two alignments, and the
// disagreement would land as the wrong sentence being taken into the book.
import { alignParagraphs, alignSentences, diffSeq, splitSentences } from 'arc-canon-graph'
import type { AlignedSentence } from 'arc-canon-graph'

interface Piece { kind: 'same' | 'ins' | 'del'; text: string }

export interface ParaDiff {
  kind: 'same' | 'ins' | 'del' | 'changed'
  text?: string          // same/ins/del: the whole paragraph
  pieces?: Piece[]       // changed: word-level pieces
  /** changed only: the same paragraph aligned sentence by sentence, each
   *  carrying the identity the sentence verbs address it by (A37-3). Word
   *  pieces stay the reading view; this is the judging view. */
  sentences?: AlignedSentence[]
  /** The identity the paragraph verbs address this paragraph by — the same
   *  pair the server re-derives. Carried here rather than recovered later by
   *  matching text, which could only ever find a paragraph in the version it
   *  searched and silently returned the wrong index when the two disagreed. */
  mainIndex: number | null
  draftIndex: number | null
}

const paras = (s: string) => s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
const words = (s: string) => s.split(/\s+/).filter(Boolean)

function diffWords(a: string, b: string): Piece[] {
  const wa = words(a), wb = words(b)
  const pieces: Piece[] = []
  let i = 0, j = 0
  for (const op of diffSeq(wa, wb)) {
    const text = op === 'ins' ? wb[j] : wa[i]
    if (op !== 'ins') i++
    if (op !== 'del') j++
    const last = pieces[pieces.length - 1]
    if (last && last.kind === op) last.text += ' ' + text
    else pieces.push({ kind: op, text })
  }
  return pieces
}

/** Diff two prose bodies.
 *
 *  The paragraph alignment comes from arc-canon-graph, which is also what the
 *  server merges against, so what the author right-clicks and what gets
 *  committed cannot disagree — the argument diff-seq.ts makes for sentences,
 *  applied one level up. Word-level pieces stay local: they are a reading
 *  aid and nothing is ever addressed by them. */
export function diffProse(main: string, draft: string): ParaDiff[] {
  const pa = paras(main), pb = paras(draft)
  return alignParagraphs(pa, pb).map((a): ParaDiff => {
    const ids = { mainIndex: a.mainIndex, draftIndex: a.draftIndex }
    if (a.kind === 'same') return { kind: 'same', text: pb[a.draftIndex!], ...ids }
    if (a.kind === 'del') return { kind: 'del', text: pa[a.mainIndex!], ...ids }
    if (a.kind === 'ins') return { kind: 'ins', text: pb[a.draftIndex!], ...ids }
    const was = pa[a.mainIndex!], now = pb[a.draftIndex!]
    return {
      kind: 'changed',
      pieces: diffWords(was, now),
      // The same pair, aligned by sentence with the same LCS the server
      // will use — so what the author right-clicks is what gets merged.
      sentences: alignSentences(
        splitSentences(was).map(x => x.text),
        splitSentences(now).map(x => x.text),
      ),
      ...ids,
    }
  })
}

/** Word counts added/removed — the change-summary numbers. */
export function diffStats(d: ParaDiff[]): { ins: number; del: number } {
  let ins = 0, del = 0
  for (const p of d) {
    if (p.kind === 'ins') ins += words(p.text!).length
    if (p.kind === 'del') del += words(p.text!).length
    for (const pc of p.pieces ?? []) {
      if (pc.kind === 'ins') ins += words(pc.text).length
      if (pc.kind === 'del') del += words(pc.text).length
    }
  }
  return { ins, del }
}
