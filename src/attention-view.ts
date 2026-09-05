// What the attention chip counts, and what it does not.
//
// It used to count everything arc had ever noticed: "26 warnings · 22
// proposals · 4 unfired payoffs · 2 unmet obligations". Fifty-four items,
// permanently. Measured on the working novel, three of those warnings were
// genuine contradictions and twenty-three were the lifecycle check saying an
// entity depends on something still proposed — which is the proposal queue
// counted a second time, from the other end. A count that never reaches zero
// stops being read, and the three things the author could fix that day were
// the hardest things in it to see.
//
// So the chip counts contradictions: places where the record disagrees with
// itself and code can prove it. Everything else it used to count is the
// shape of an unfinished book — proposals waiting to be ratified, payoffs
// planted and not yet fired, what the story still owes — and stays in the
// panel under what it actually is.
//
// The split reads the check's OWN NAME, never its phrasing: a new check
// joins the right side by declaring itself, and a reworded message cannot
// silently move between them.
import type { AttentionResponse } from './canon'

type Finding = AttentionResponse['findings'][number]

/** Checks that report the record disagreeing with itself: someone in two
 *  places at once, an effect before its cause, an object in two hands, a
 *  life event outside a lifespan, a relationship that starts before its
 *  endpoint exists. Each is provable, each is a fault, each can be fixed. */
const CONTRADICTION = new Set(['lifespan', 'causality', 'custody', 'co-location', 'span-sanity'])

/** `lifecycle` is the one check that reports bookkeeping rather than a
 *  fault — "depends on proposed", "deprecated with no superseded_by". True,
 *  worth seeing, and not a contradiction. */
export const isContradiction = (f: Finding): boolean => CONTRADICTION.has(f.check)

export interface AttentionSplit {
  contradictions: Finding[]
  /** The lifecycle notices, kept and shown as what they are. */
  housekeeping: Finding[]
}

export function splitFindings(findings: Finding[]): AttentionSplit {
  return {
    contradictions: findings.filter(isContradiction),
    housekeeping: findings.filter(f => !isContradiction(f)),
  }
}

/** The chip's own words. Zero is now reachable, so "all clear" means it. */
export function attentionLabel(contradictions: Finding[]): string {
  const n = contradictions.length
  if (!n) return 'all clear'
  return `${n} contradiction${n === 1 ? '' : 's'}`
}

/** How loudly the chip reads. An error among the contradictions is the only
 *  thing that earns the error colour; anything else that is merely waiting
 *  earns none at all. */
export function attentionTone(contradictions: Finding[]): '' | ' warn' | ' err' {
  if (!contradictions.length) return ''
  return contradictions.some(f => f.severity === 'error') ? ' err' : ' warn'
}

/** How much is waiting but not wrong — the number on the fold, so the author
 *  can see there is more without it competing with the count that matters. */
export function waitingCount(a: AttentionResponse, housekeeping: Finding[]): number {
  return housekeeping.length + a.proposedRecords.length
    + a.danglingPayoffs.length + a.unmetObligations.length
}
