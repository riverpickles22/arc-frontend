// The route viewer's data half (A51): what an alternative shows the author,
// as pure functions so the rendering rules are testable without a DOM.
import type { RouteAlternative, RouteCoverage, RouteLockNotice } from 'arc-canon-graph/api-types.ts'

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
