// Reading a style contract's shape (conventions §10) — pure, so the Style
// page stays a thin renderer. Mirrors wiki-landing.ts: scrape structure out
// of a hand-written doc, never impose one on it. A contract that does not
// follow the template still renders; it just has fewer affordances.
import { slugOf } from './md'

export interface StyleSection { title: string; slug: string }

/** The `##` headings, for the section rail. Anchors share md.ts's slugOf so
 *  the rail's links resolve against the rendered body. */
export function sectionsOf(body: string): StyleSection[] {
  const out: StyleSection[] = []
  for (const line of body.split('\n')) {
    const m = line.match(/^## (.+)$/)
    if (m) out.push({ title: m[1].trim(), slug: slugOf(m[1].trim()) })
  }
  return out
}

/** The pre-draft checklist — the gate a drafting pass runs before showing
 *  prose. Found by heading, read as an ordered list. Empty when the contract
 *  has no checklist, which is a fact worth showing rather than hiding. */
export function checklistOf(body: string): string[] {
  const sec = sectionOf(body, /checklist/i)
  if (!sec) return []
  return sec.split('\n')
    .map(l => l.match(/^\d+\. (.*)$/)?.[1]?.trim())
    .filter((x): x is string => !!x)
}

/** Touchstones — passages quoted from the manuscript that calibrate a rule,
 *  each introduced by a bold label. Returns the labels only; the body renders
 *  through the normal markdown path. */
export function touchstonesOf(body: string): string[] {
  const sec = sectionOf(body, /touchstone/i)
  if (!sec) return []
  return sec.split('\n')
    .map(l => l.match(/^\*\*(.+?)\*\*/)?.[1]?.trim())
    .filter((x): x is string => !!x)
}

/** The text of the first `##` section whose title matches. */
export function sectionOf(body: string, title: RegExp): string | null {
  const lines = body.split('\n')
  const start = lines.findIndex(l => /^## /.test(l) && title.test(l))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => /^## /.test(l))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** Rules a contract states, counted for the infobox — every list item outside
 *  the touchstones and checklist sections. An honest approximation, labeled
 *  as such in the UI, not a claim about the contract's true size. */
export function ruleCount(body: string): number {
  let count = 0
  let heading = ''
  for (const line of body.split('\n')) {
    const h = line.match(/^## (.+)$/)
    if (h) { heading = h[1]; continue }
    if (/touchstone|checklist|open question/i.test(heading)) continue
    if (/^[-*] /.test(line)) count++
  }
  return count
}
