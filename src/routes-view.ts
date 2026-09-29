// The route viewer's data half (A51): what an alternative shows the author,
// as pure functions so the rendering rules are testable without a DOM.
import type { DroppedClaim, RouteAlternative, RouteCoverage, RouteGateReading, RouteLockNotice, RouteNote, RouteReceipt } from 'arc-canon-graph/api-types.ts'
import type { RunEnding } from 'arc-canon-graph/api-types.ts'
import type { ResolvedAnnotation } from './canon'

export interface CoverageRow { item: string; where: string }

/** The coverage table: one row per required beat the pass reported, with
 *  "not reported" where the pass said nothing — argued claims, never a
 *  computed verdict, and never a guess when the tail was missing. */
export function coverageRows(coverage: RouteCoverage[] | null): CoverageRow[] {
  if (!coverage) return []
  return coverage.map(c => ({ item: c.item, where: c.paragraph === null ? 'not reported' : `¶${c.paragraph}` }))
}

/** What was dropped, where the route is: claims the pass made whose
 *  evidence did not resolve against the destination it was given (A67-8).
 *  Counted by reason, in the author's terms — never a silent omission. */
export function droppedLabel(dropped: DroppedClaim[] | undefined): string | null {
  if (!dropped?.length) return null
  const said = (d: DroppedClaim): string => {
    const claims = `${d.count} claim${d.count === 1 ? '' : 's'}`
    switch (d.reason) {
      case 'outside the slice': return `${claims} about something this pass was not asked to reach`
      case 'unparseable': return `${claims} arc could not read`
      default: return `${claims} whose evidence did not resolve`
    }
  }
  return `${dropped.map(said).join(' · ')} — dropped`
}

/** A route whose ground has moved, in the author's terms (A67-10). Two
 *  different things the author reads differently: a route an older arc
 *  wrote, which has no receipt to open, and a governed route whose scene or
 *  style contract has changed under it. Null when it still holds. */
export function staleLabel(alt: RouteAlternative): string | null {
  if (!alt.stale) return null
  return alt.stale.why === 'written by an older arc'
    ? 'written by an older arc'
    : alt.stale.changed.includes(alt.scene)
      ? 'the scene has changed since this was written'
      : 'what this was written from has changed'
}

/** What the STRIP says about a stale route: that it is out of date, and
 *  nothing else. What moved, and the one click that helps, belong to the
 *  route itself — the author decides to ask again while reading the prose
 *  it would replace, not from a list of alternatives (A67-15). */
export const staleChip = (alt: RouteAlternative): string | null =>
  alt.stale ? 'out of date' : null

/** THE TWO GESTURES, IN ONE VOCABULARY (A67-15, A69-13). They are near each
 *  other on the page and they do opposite things, so the words that tell
 *  them apart live here rather than in the markup.
 *
 *  *Ask again* re-issues THIS route's job — the same notes, the same line —
 *  against the record as it stands now, and the answer takes its place. The
 *  scene keeps the same number of ways through, and the author keeps the one
 *  they were reading.
 *
 *  *Another way through* is the only gesture that ADDS one. */
export const ASK_AGAIN = 'Ask again: the same request, against the record as it stands now. This route is replaced by what comes back.'
export const ANOTHER_WAY = 'Another way through: a different route, beside the ones already here.'

/** Where a re-issued route came from, in the author's words (A69-13). The
 *  receipt it re-issued is a run id — arc's word, not theirs — so what the
 *  fold says is that this route is a second asking, and whether the one it
 *  replaced left a record of its own. Null when this run was not one. */
export function reissuedLine(r: { reissued?: boolean; reissued_from?: string }): string | null {
  if (!r.reissued && !r.reissued_from) return null
  return r.reissued_from
    ? 'You asked again for this one. It was the same request as the route it replaced, made again against the record as it stood.'
    : 'You asked again for this one. The route it replaced was written by an older arc and left nothing to compare it with.'
}

/** Whether the WRITE PATH would refuse this route — the only ground on which
 *  the viewer closes adopt. arc-backend's `adoptAlternative` refuses exactly
 *  one staleness, `the record moved`: a route must never be written over
 *  newer work. A route written by an older arc is stale in the other sense —
 *  it carries no receipt, so arc cannot say what it was written from — but it
 *  is still the author's prose and still theirs to take, and greying adopt on
 *  it takes away a choice arc would have honoured. */
export const blocksAdopt = (alt: RouteAlternative): boolean =>
  alt.stale?.why === 'the record moved'

/** What cancelling this route keeps. The author's notes on a route are
 *  their words: they go into the record with the disposition rather than
 *  away with the file, and the confirm says so (A67-10). It is the second
 *  click's whole label, in the reader where cancel now lives (A67-15). */
export function cancelPrompt(alt: RouteAlternative): string {
  const n = alt.notes?.length ?? 0
  if (!n) return 'Really cancel it? The record says you let it go.'
  return n === 1
    ? 'Really cancel it? Your note on it stays on the record.'
    : `Really cancel it? Your ${n} notes on it stay on the record.`
}

/** What the overlap figure says, in the author's terms. Null is honest:
 *  too few countable paragraphs to judge, and the gate said so. */
export function overlapLabel(share: number | null): string {
  if (share === null) return 'overlap: not measurable (too few paragraphs)'
  return `overlap with the current wording: ${Math.round(share * 100)}%`
}

export const seedLabel = (seed: string): string =>
  ({ 'late-entry': 'late entry', 'pressure-first': 'pressure first', unseeded: 'unseeded', stopped: 'this one' } as Record<string, string>)[seed] ?? seed

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

// ---- the receipt, as the author reads it (A67-11) -------------------------

/** How the run ended, in the author's words. The wire's endings are arc's
 *  vocabulary; a line under the prose must not be. */
export function endingLabel(ending?: RunEnding): string {
  switch (ending) {
    case 'landed': return 'it landed'
    case 'refused': return 'arc would not keep the answer'
    case 'cancelled': return 'you stopped it'
    case 'timed out': return 'it ran past its time'
    case 'budget': return 'it ran past its room'
    case 'unreadable': return 'the answer came back unreadable'
    case 'could not run': return 'it could not start'
    case 'unfinished': return 'arc was closed while it worked'
    default: return 'still open'
  }
}

/** THE THREE READINGS OF WHAT THE PASS WAS NOT GIVEN, kept apart on purpose
 *  (criterion 2): "arc chose not to show it", "arc ran out of room", and
 *  "the runtime added this on its own" are three different facts, and a
 *  page that merges them tells the author none of them.
 *
 *  A reading with nothing in it still gets its line, saying so — an absent
 *  heading reads as "this did not happen", and "nothing was dropped" is a
 *  thing the author wants to be told. */
export interface ReceiptReading { heading: string; items: string[]; empty: string }
export function receiptReadings(r: RouteReceipt): ReceiptReading[] {
  return [
    { heading: 'Given to the pass', items: r.given, empty: 'nothing — the pass ran on its rules alone' },
    { heading: 'Withheld by design', items: r.withheld_by_design, empty: 'nothing was withheld' },
    { heading: 'Dropped for room', items: r.dropped_for_budget, empty: 'nothing was dropped — it all fit' },
    { heading: 'Added by the runtime', items: r.runtime_added, empty: 'nothing arc did not ask for' },
  ]
}

/** One gate, in a line: what it checks, how it came out, what it measured and
 *  the bar it measured against. Proven, always — a gate is code.
 *
 *  `says` and not `gate`: the id is arc's vocabulary (rule 9), and the server
 *  is the one place that knows the author's word for each one, so the two can
 *  never drift into two different vocabularies. */
export function gateLine(g: RouteGateReading): string {
  const measured = g.measured === null || g.measured === undefined ? ''
    : g.bar === null || g.bar === undefined ? ` — ${g.measured}`
    : ` — ${g.measured} against ${g.bar}`
  return `${g.says || g.gate}: ${g.verdict}${measured}${g.attempt > 1 ? ` (attempt ${g.attempt})` : ''}`
}

/** How long the run took, in words a person uses about a minute. */
export function tookLabel(ms?: number): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
  const m = Math.round(s / 6) / 10
  return `${m} minute${m === 1 ? '' : 's'}`
}

// ---- the writing run's receipt, as the author reads it (A69-11) ------------

/** WHAT EACH LAYER OF THE BRIEF IS CALLED, in the author's words. The wire
 *  names are arc's vocabulary — `dramatic-condition`, `promoted-rules` — and
 *  rule 9 keeps arc's vocabulary off the page. A layer arc adds later and
 *  this list has not caught up with falls through to its own name rather
 *  than vanishing: an unnamed layer is still a layer the author was shown. */
const LAYER_WORDS: Record<string, string> = {
  intent: 'What you asked for',
  contract: 'What the scene has to do',
  handoff: 'Where the last scene left the story',
  'dramatic-condition': 'What is live here',
  canon: 'The record at this moment',
  position: 'Where the scene sits',
  voice: 'How everyone here sounds',
  research: 'Research',
  notes: 'Your notes on this scene',
  'promoted-rules': 'Your style contract',
  withholds: 'What it must not reveal',
  locks: 'The paragraphs you settled',
}
export const layerWords = (layer: string): string => LAYER_WORDS[layer] ?? layer

/** THE FOUR STATUSES, KEPT APART (A69-2). "arc chose not to show it", "arc
 *  ran out of room", "arc does not read this yet" and "there is honestly
 *  nothing here" are four different facts about a book, and one word for all
 *  of them is how a brief stops being readable. Never *missing*. */
export function layerStatusWords(status: string): string {
  switch (status) {
    case 'given': return 'given to the pass'
    case 'not shown': return 'not shown — room ran out'
    case 'deferred': return 'arc does not read this yet'
    case 'none': return 'nothing here'
    default: return status
  }
}

export interface LayerReadingRow { layer: string; heading: string; status: string; detail: string }

/** One row per layer of the brief: what it is called, how it came out, and
 *  why when it is not `given` — the reason as the backend recorded it, which
 *  is already the author's words (*the first scene of the book*, *research is
 *  not read yet*). Ids are shown only where they name things the author
 *  knows: scenes, notes, people. */
export function layerReadings(r: RouteReceipt): LayerReadingRow[] {
  return (r.layers ?? []).map(l => {
    const bits: string[] = [layerStatusWords(l.status)]
    if (l.status !== 'given' && l.because) bits.push(l.because)
    if (l.note) bits.push(l.note)
    if (l.rungs?.length) bits.push(l.rungs.map(g => `${g.scene} at ${g.rung}`).join('; '))
    if (l.status === 'given' && l.ids.length) bits.push(l.ids.join(', '))
    return { layer: l.layer, heading: layerWords(l.layer), status: l.status, detail: bits.join(' · ') }
  })
}

/** WHAT THE RUN LEANED ON that the record has not looked at lately (A69-6).
 *  Proven from the manifest by code — a pass never writes this — and said
 *  where the author is already reading rather than left in a file. */
export function leanedOnLine(r: RouteReceipt): string | null {
  const aged = r.leaned_on ?? []
  if (!aged.length) return null
  return `It leans on ${aged.map(l => `${l.id} as of ${l.as_of}`).join(', ')} — the record has not looked since.`
}

/** THE LINE SAID, AND THE CRAFT IT BECAME (A69-4). The author's own words
 *  first, because they are what the author remembers saying; then what the
 *  writing pass actually received in their place. */
export function intentLines(r: RouteReceipt): { said: string | null; plan: string | null; note: string | null } {
  const i = r.intent
  if (!i) return { said: null, plan: null, note: null }
  const said = i.said ? `You said: “${i.said}”` : null
  const plan = i.plan?.moves.length ? `Writing toward: ${planWords(i.plan.moves)}` : null
  const note = i.withdrawn
    ? 'You read what that became and drafted without it.'
    : i.note === 'nothing to translate'
      ? 'You said nothing about this one, so there was nothing to turn into craft.'
      : i.note ?? null
  return { said, plan, note }
}

/** A craft plan as one line. The moves are arc's ids and never reach the
 *  page (A69-4): what the author reads is the clause each one carries. */
export const planWords = (moves: { move: string; how: string }[]): string =>
  moves.map(m => m.how.trim()).filter(Boolean).join('; ')

/** WHAT THE NOTES WERE, AND WHOSE (A69-9). A note arc wrote is never handed
 *  to a writing pass as an instruction, so seeing one here at all would be a
 *  fault — which is exactly why the fold says who wrote each. */
export const notesHandedLine = (r: RouteReceipt): string | null => {
  const n = r.notes_handed ?? []
  if (!n.length) return null
  return n.map(x => `${x.id}${x.by === 'agent' ? ' (arc’s own)' : ''}`).join(', ')
}

/** ARC HAS CHANGED SINCE THIS RAN (Q14, the author's decision): a LABEL, and
 *  never a staleness that hides the work. What is on the page is still the
 *  prose arc wrote; asking again is how you get what arc would write now. */
export const OLDER_ARC = 'written by an older arc'
