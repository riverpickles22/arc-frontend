// The route viewer's data half (A51): what an alternative shows the author,
// as pure functions so the rendering rules are testable without a DOM.
import type { RouteAlternative, RouteCoverage, RouteLockNotice, RouteNote } from 'arc-canon-graph/api-types.ts'
import type { ResolvedAnnotation } from './canon'

export interface CoverageRow { item: string; where: string }

/** The coverage table: one row per required beat the pass reported, with
 *  "not reported" where the pass said nothing — argued claims, never a
 *  computed verdict, and never a guess when the tail was missing. */
export function coverageRows(coverage: RouteCoverage[] | null): CoverageRow[] {
  if (!coverage) return []
  return coverage.map(c => ({ item: c.item, where: c.paragraph === null ? 'not reported' : `¶${c.paragraph}` }))
}

/** What the overlap figure says, in the author's terms. Null is honest:
 *  too few countable paragraphs to judge, and the gate said so. */
export function overlapLabel(share: number | null): string {
  if (share === null) return 'overlap: not measurable (too few paragraphs)'
  return `overlap with the current wording: ${Math.round(share * 100)}%`
}

export const seedLabel = (seed: string): string =>
  ({ 'late-entry': 'late entry', 'pressure-first': 'pressure first', unseeded: 'unseeded' } as Record<string, string>)[seed] ?? seed

/** The pre-run notice: which locks will constrain the route, and whether one
 *  of them refuses the run outright. A paragraph lock survives verbatim and
 *  in order while everything around it changes — the author should know
 *  that before spending a pass. */
export function lockNotice(locks: RouteLockNotice[]): { blocked: string | null; constrain: string | null } {
  const whole = locks.find(l => l.scope === 'scene' || l.scope === 'chapter')
  if (whole) {
    return { blocked: `${whole.scope === 'chapter' ? 'This chapter' : 'This section'} is locked (${whole.id}) — the author settled it whole; unlock it to take another way through.`, constrain: null }
  }
  const paras = locks.filter(l => l.scope === 'paragraph' && l.paragraph !== null).map(l => `¶${(l.paragraph as number) + 1} (${l.id})`)
  if (!paras.length) return { blocked: null, constrain: null }
  return { blocked: null, constrain: `Locked ${paras.length === 1 ? 'paragraph' : 'paragraphs'} ${paras.join(', ')} will survive verbatim and in order; the prose around ${paras.length === 1 ? 'it' : 'them'} will change, so read ${paras.length === 1 ? 'it' : 'them'} again in the new route.` }
}

/** Newest first, the order the store lists them; kept as a function so the
 *  viewer never sorts by anything a test cannot see. */
export const byNewest = (alts: RouteAlternative[]): RouteAlternative[] =>
  [...alts].sort((x, y) => y.created_at.localeCompare(x.created_at))

export interface RouteChain { head: RouteAlternative; earlier: RouteAlternative[] }

/** Version chains: a rewrite (`revises`) folds under the version that
 *  replaced it — the newest version of each route reads as the route, its
 *  ancestors in `earlier` (nearest first). A version whose parent is
 *  missing reads as its own head rather than erroring; a parent with two
 *  rewrites appears under each, which is honest — both descend from it. */
export function chainsOf(alts: RouteAlternative[]): RouteChain[] {
  const sorted = byNewest(alts)
  const byId = new Map(sorted.map(a => [a.id, a]))
  const revised = new Set(sorted.map(a => a.revises).filter((r): r is string => typeof r === 'string' && byId.has(r)))
  const heads = sorted.filter(a => !revised.has(a.id))
  return heads.map(head => {
    const earlier: RouteAlternative[] = []
    const seen = new Set<string>([head.id])
    let cur = head
    while (cur.revises) {
      const parent = byId.get(cur.revises)
      if (!parent || seen.has(parent.id)) break
      earlier.push(parent)
      seen.add(parent.id)
      cur = parent
    }
    return { head, earlier }
  })
}

/** A route's notes gathered by the paragraph they are about; whole-route
 *  notes come back under `whole`. Paragraph keys are 1-based, as stored. */
export function notesByParagraph(alt: RouteAlternative): { whole: RouteNote[]; byParagraph: Map<number, RouteNote[]> } {
  const whole: RouteNote[] = []
  const byParagraph = new Map<number, RouteNote[]>()
  for (const n of alt.notes ?? []) {
    if (n.paragraph === null) { whole.push(n); continue }
    const at = byParagraph.get(n.paragraph) ?? []
    at.push(n)
    byParagraph.set(n.paragraph, at)
  }
  return { whole, byParagraph }
}

/** Where a note is about, in the author's terms. */
export const noteLabel = (n: RouteNote): string =>
  n.paragraph === null ? 'the route as a whole' : `¶${n.paragraph}`

/** A rewrite needs something to go on: a note on the route, or a line typed
 *  now. With neither it would be a fresh reroute, and that button exists. */
export const canRewrite = (alt: RouteAlternative, extra: string): boolean =>
  (alt.notes ?? []).some(n => n.body.trim().length > 0) || extra.trim().length > 0

/** The passage a note is about, for the composer's blockquote — the same
 *  affordance the manuscript shows over its own note composer. Long
 *  paragraphs are cut, because the quote is there to say WHERE, not to be
 *  read again. */
export function quoteOf(body: string, paragraph: number, limit = 180): string {
  // The SAME split the index came from (core's paragraphsOf, /\n{2,}/) — a
  // blank line carrying whitespace must not shift every quote by one.
  const para = body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)[paragraph - 1] ?? ''
  const flat = para.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? flat.slice(0, limit).trimEnd() + '…' : flat
}

/** Paragraphs, split the one way the whole app splits them. Route note
 *  paragraph indices are 1-based against THIS list. */
export const paragraphsOf = (body: string): string[] =>
  body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

/** Anchor keys for a route's paragraphs.
 *
 *  Deliberately NOT the manuscript's `scene:index` shape and deliberately
 *  colon-free: the reading-position anchors split a key on its LAST colon to
 *  recover a scene, so a route key carrying one could be read as a scene key
 *  with no scene. `route@0` is the route AS A WHOLE — paragraphs are 1-based,
 *  so 0 was free. */
const ROUTE_KEY = 'route@'
export const routeKey = (paragraph: number | null): string => `${ROUTE_KEY}${paragraph ?? 0}`
export const isRouteKey = (key: string): boolean => key.startsWith(ROUTE_KEY)
export const routeParagraphOf = (key: string): number => Number(key.slice(ROUTE_KEY.length)) || 0

/** One card in the notes rail, in the ONE order that is both rendered and
 *  measured. `key` is what the rail measures against; null means the card has
 *  no passage and takes the top of the rail. */
export type RailCard =
  | { kind: 'composer'; id: 'composer'; key: string | null; yHint?: number }
  | { kind: 'note'; id: string; key: string | null; note: ResolvedAnnotation }
  | { kind: 'route'; id: string; key: string | null; note: RouteNote }

/** What the rail shows: the chapter's notes, and — while a route is being
 *  read — that route's notes in the same column.
 *
 *  The routed scene's OWN notes stand down while its route is open, because
 *  its prose is not on the page; the reader replaced it. A card beside prose
 *  that is not rendered has nothing to be level with, and today those pile at
 *  the rail's floor pointing at nothing. Every other scene keeps its notes:
 *  that prose is still on screen above and below the reader. */
export function railCards(input: {
  notes: ResolvedAnnotation[]
  /** the scene whose route is being read; null when none is */
  routedScene: string | null
  route: RouteAlternative | null
  composer: { key: string | null; yHint?: number } | null
}): RailCard[] {
  const out: RailCard[] = []
  // The composer holds index 0, as it always has: it opens level with the
  // passage that provoked it, and the measuring pass reads index 0 first.
  if (input.composer) out.push({ kind: 'composer', id: 'composer', key: input.composer.key, yHint: input.composer.yHint })
  const standDown = input.route ? input.routedScene : null
  for (const n of input.notes) {
    if (standDown && n.anchor.scene === standDown) continue
    out.push({
      kind: 'note', id: n.id, note: n,
      key: n.resolution.paragraph === null ? null : `${n.anchor.scene}:${n.resolution.paragraph}`,
    })
  }
  for (const n of input.route?.notes ?? []) {
    out.push({ kind: 'route', id: n.id, note: n, key: routeKey(n.paragraph) })
  }
  return out
}

/** How many of the chapter's notes stood down for the open route. */
export const standDownCount = (notes: ResolvedAnnotation[], routedScene: string | null, route: RouteAlternative | null): number =>
  route && routedScene ? notes.filter(n => n.anchor.scene === routedScene).length : 0

/** The rail's heading, in the author's terms. One heading whatever it holds:
 *  a second title would make the rail read as a different surface, and it is
 *  the same surface showing a different reading. */
export function railMeta(input: { route: RouteAlternative | null; open: number; standDown: number }): string {
  if (!input.route) return input.open ? `${input.open} open` : ''
  const r = input.route.notes?.length ?? 0
  const parts = [r ? `${r} on this route` : 'none on this route yet']
  if (input.open) parts.push(`${input.open} elsewhere in the chapter`)
  if (input.standDown) parts.push(`${input.standDown} on the scene, back when you close the route`)
  return parts.join(' · ')
}
