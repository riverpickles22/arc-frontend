// What is waiting in the book, where the book-wide things live.
//
// This began as a banner pinned above the open chapter, counting the whole
// manuscript. Placement is a scope claim: an author reading the Prologue
// read "1 scene changed" as a fact about the Prologue and went looking for a
// diff that was in Chapter 1. So the count moved up here, beside Material
// and the attention chip, where everything already speaks for the book
// (A64-2).
//
// Then the index it opens moved with it (A64-6). It used to render in the
// manuscript's own scroll region, which meant the thing telling you what is
// waiting vanished the moment you read anything, and was invisible from
// every other page. A dropdown from the chip is reachable from anywhere.
//
// It is an INDEX and nothing else: what is waiting, where, and a way to go
// and read it. Every decision about the book happens at the change itself,
// with the prose on screen — never in a dropdown (A64-3).
import type { Chapter, ProseDraft, ProseScene } from '../canon'
import { diffProse, diffStats } from '../diff'
import { draftWhere, groupByChapter, placeChanges } from '../draft-map'

export function DraftChip({ draft, scenes, chapters, open, onToggle, onGo }: {
  draft: ProseDraft
  scenes: ProseScene[]
  chapters: Chapter[]
  open: boolean
  /** Opens and closes the index. */
  onToggle: () => void
  /** Go and read one change: the manuscript, that chapter, that scene. */
  onGo: (scene: string) => void
}) {
  // Nothing pending is nothing to say. A chip that reads "0 scenes in draft"
  // is furniture reporting its own emptiness.
  const n = draft.changes.length
  if (!draft.git || !n) return null

  // The index is book-wide by construction, so no chapter is "here" — every
  // row names where it is, which is the whole point of the panel.
  const placed = placeChanges(draft.changes, scenes, chapters, null)
  const byFile = new Map(scenes.map(s => [s.file, s]))
  const counts = (file: string, main: string) =>
    diffStats(diffProse(main, byFile.get(file)?.body ?? ''))

  return (
    <>
      <button className={open ? 'attn-chip on' : 'attn-chip'} aria-pressed={open} onClick={onToggle}
        title={`${n === 1 ? 'One scene has' : `${n} scenes have`} unaccepted changes. Open to see where they are, then read each one where it is.`}>
        ✎ {n} scene{n === 1 ? '' : 's'} in draft
      </button>
      {open && (
        <div className="attn-drawer dd-index">
          <p className="dd-sum"><b>Waiting for you</b> — {draftWhere(placed, null)}</p>
          {groupByChapter(placed).map(g => (
            <div key={g.chapter ?? 'unplaced'} className="attn-group">
              <h3>{g.label}</h3>
              {g.changes.map(c => {
                const st = counts(c.file, draft.changes.find(x => x.file === c.file)?.main?.body ?? '')
                const go = c.scene && c.status !== 'deleted'
                return (
                  <div key={c.file} className="attn-row">
                    <span className={`stpill ${c.status}`}>{c.status}</span>
                    {go
                      ? <button className="db-where" title={`Read ${c.scene} with the change in view`}
                          onClick={() => onGo(c.scene!)}>{c.scene}</button>
                      : <span className="db-where is-off">{c.scene ?? c.file}</span>}
                    <span className="dd-counts">
                      <span className="ins-ct">+{st.ins}</span> <span className="del-ct">−{st.del}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
