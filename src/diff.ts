// Prose diff for the draft layer: paragraphs first, then words within
// changed paragraph pairs. Plain LCS — prose-sized inputs, no dependency.

interface Piece { kind: 'same' | 'ins' | 'del'; text: string }

export interface ParaDiff {
  kind: 'same' | 'ins' | 'del' | 'changed'
  text?: string          // same/ins/del: the whole paragraph
  pieces?: Piece[]       // changed: word-level pieces
}

type Op = 'same' | 'del' | 'ins'

function diffSeq(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length
  // Far beyond any real chapter — degrade to replace-all rather than stall.
  if ((n + 1) * (m + 1) > 16_000_000) {
    return [...(Array(n).fill('del') as Op[]), ...(Array(m).fill('ins') as Op[])]
  }
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push('same'); i++; j++ }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push('del'); i++ }
    else { ops.push('ins'); j++ }
  }
  while (i < n) { ops.push('del'); i++ }
  while (j < m) { ops.push('ins'); j++ }
  return ops
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

/** Diff two prose bodies. Changed paragraphs in the same run pair up
 *  positionally and diff word by word; unpaired ones stay whole. */
export function diffProse(main: string, draft: string): ParaDiff[] {
  const pa = paras(main), pb = paras(draft)
  const ops = diffSeq(pa, pb)
  const out: ParaDiff[] = []
  let i = 0, j = 0, k = 0
  while (k < ops.length) {
    if (ops[k] === 'same') { out.push({ kind: 'same', text: pb[j] }); i++; j++; k++; continue }
    const dels: string[] = [], inss: string[] = []
    while (k < ops.length && ops[k] !== 'same') {
      if (ops[k] === 'del') dels.push(pa[i++])
      else inss.push(pb[j++])
      k++
    }
    const pairs = Math.min(dels.length, inss.length)
    for (let p = 0; p < pairs; p++) out.push({ kind: 'changed', pieces: diffWords(dels[p], inss[p]) })
    for (let p = pairs; p < dels.length; p++) out.push({ kind: 'del', text: dels[p] })
    for (let p = pairs; p < inss.length; p++) out.push({ kind: 'ins', text: inss[p] })
  }
  return out
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
