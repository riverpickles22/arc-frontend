// THE DRAFTING BAR'S DECISIONS (A69-11) — the three states a line can be in,
// as functions rather than as branches buried in a view.
//
// The whole point of the plan step is that NOTHING IS WRITTEN while the
// author is reading it (A69-4). That property lives or dies on which
// response is treated as a plan and which as a draft, and on what the second
// call carries — so both are here, where a test can hold them.
import type { CraftPlanned, DraftSceneResponse } from 'arc-canon-graph/api-types.ts'

/** What the author is looking at after a press. */
export type DraftStep =
  /** a plan to read, edit, drop or go — and no prose anywhere yet */
  | { step: 'plan'; moves: { move: string; how: string }[] }
  /** the pass wrote; the draft is in the draft layer for the author to judge */
  | { step: 'drafted' }

/** WHICH OF THE TWO THIS ANSWER IS.
 *
 *  A plan AND no file is the reading answering: the author reads one line
 *  and nothing has been written. Anything else means the pass wrote — an
 *  engine with no craft-plan stage, or a second call — and the author gets
 *  the draft rather than a step that never comes. Asking for `file` and not
 *  only for `plan` is what keeps a landed draft from being hidden behind a
 *  plan the author has already settled. */
export function readDraftAnswer(res: DraftSceneResponse): DraftStep {
  return res.plan?.moves.length && !res.file
    ? { step: 'plan', moves: res.plan.moves }
    : { step: 'drafted' }
}

/** IS THERE ANYTHING TO TRANSLATE? A press with no line skips the reading
 *  entirely: there is no effect to turn into craft, so a plan step would be
 *  a pass spent on nothing and a question the author cannot answer. */
export const saysSomething = (line: string): boolean => line.trim().length > 0

/** WHAT GO AND DROP SEND (A69-4's three request states).
 *
 *  `undefined` — the author has not been shown a plan; a line comes back as
 *  craft and nothing is written. A plan — they settled it, as given or
 *  edited. `null` — they read it and withdrew the line: the pass runs
 *  without the craft, and the record still carries what they said. */
export function planToSend(plan: { moves: { move: string; how: string }[] } | null, keep: boolean): CraftPlanned | null {
  return keep && plan?.moves.length ? { moves: plan.moves } : null
}

/** One clause edited in place, by position. The MOVE IDS ARE NEVER TOUCHED:
 *  the record carries ids and the page carries clauses, so editing what the
 *  pass is told to do can never rewrite what was asked for (A69-4). */
export function editClause(
  moves: { move: string; how: string }[], at: number, how: string,
): { move: string; how: string }[] {
  return moves.map((m, i) => (i === at ? { ...m, how } : m))
}
