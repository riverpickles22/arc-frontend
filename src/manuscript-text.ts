// Copying prose out of the viewer.
//
// What comes out is the prose and nothing else — no frontmatter, no scene id,
// no contract, no chapter title, no separator invented to mark a boundary the
// manuscript itself does not carry. The author is copying the text to read it
// somewhere else; anything arc adds is something they have to delete.
//
// Scenes join with a blank line, the same break that separates paragraphs on
// disk, so a pasted chapter reads exactly as the files do.

// What version gets copied: the manuscript as it would stand if the pending
// draft were accepted — everything already ratified, plus every proposed
// change, and none of the text a change overrides. That falls out of where
// the text comes from: `ProseScene.body` is read from the working tree, while
// the overridden version lives only on `ProseChange.main`, which exists for
// the diff view. Nothing here may read `main`. The one case the working tree
// cannot express is a scene the draft DELETES — it is gone from disk but
// still rendered from `main`, so it is excluded explicitly below.

interface ProseLike {
  body: string
}

/** A pending change to a prose file (the ProseChange shape, narrowed to what
 *  copying needs). `main` is deliberately absent — copy never reads it. */
interface ChangeLike {
  file: string
  status: 'added' | 'modified' | 'deleted'
}

/** Scenes that belong in a copy: everything on disk, minus anything the
 *  pending draft deletes. */
export function copyableScenes<T extends ProseLike & { file: string }>(
  scenes: T[],
  changes: ChangeLike[] = [],
): T[] {
  const deleted = new Set(changes.filter(c => c.status === 'deleted').map(c => c.file))
  return scenes.filter(s => !deleted.has(s.file))
}

/** One scene's prose, trimmed of the file's leading and trailing blank lines. */
export function sceneText(scene: ProseLike): string {
  return scene.body.trim()
}

/** Every drafted scene in the chapter, in the order given. Empty scenes drop
 *  out rather than leaving a gap. */
export function chapterText(scenes: ProseLike[]): string {
  return scenes.map(sceneText).filter(Boolean).join('\n\n')
}

/** Which paragraph a character offset in a raw scene body falls in — the
 *  index a note's anchor records, so it must match paragraphsOf exactly:
 *  split on blank lines, trimmed, empties dropped. Counting separators
 *  would drift on leading blank lines or runs of them; walking the split
 *  and asking "does this paragraph's span contain the offset" cannot.
 *
 *  An offset inside the whitespace BETWEEN paragraphs anchors to the
 *  following paragraph — a selection can only start there by starting at
 *  the head of what follows. Past the end clamps to the last paragraph. */
/** Every paragraph a selection covers, not merely the one it starts in.
 *  Locking is the caller that needs this: settling a run of prose is one
 *  decision, and asking for it three times because the menu only ever saw
 *  the first paragraph is the same decision typed three times. */
export function paragraphRange(body: string, start: number, end: number): number[] {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const out: number[] = []
  // Overlap against each paragraph's real span, rather than resolving the two
  // ends with paragraphAtOffset: that deliberately pushes an offset sitting in
  // the gap BETWEEN paragraphs onto the following one, which is right for a
  // caret and wrong for a selection's end — dragging to the top of the next
  // paragraph is how you finish selecting the previous one, and must not
  // select what you stopped at.
  let searchFrom = 0
  let index = -1
  for (const para of body.split(/\n{2,}/)) {
    const trimmed = para.trim()
    if (!trimmed) { searchFrom += para.length; continue }
    index += 1
    const s = body.indexOf(trimmed, searchFrom)
    const e = s + trimmed.length
    // A real selection overlaps; a caret (lo === hi) merely has to sit inside.
    if (lo === hi ? lo >= s && lo <= e : s < hi && e > lo) out.push(index)
    searchFrom = e
  }
  return out.length ? out : [paragraphAtOffset(body, lo)]
}

export function paragraphAtOffset(body: string, offset: number): number {
  let searchFrom = 0
  let index = -1
  for (const para of body.split(/\n{2,}/)) {
    const trimmed = para.trim()
    if (!trimmed) { searchFrom += para.length; continue }
    index += 1
    const start = body.indexOf(trimmed, searchFrom)
    const end = start + trimmed.length
    if (offset <= end) return index
    searchFrom = end
  }
  return Math.max(0, index)
}

/** Where a paragraph starts, as a character offset into the raw body — the
 *  exact inverse of `paragraphAtOffset`, and it walks the split the same way
 *  so the two cannot disagree about what paragraph three is.
 *
 *  Used to find a paragraph inside a textarea, which has no DOM to measure:
 *  the offset is what you slice the text at before measuring a copy of it.
 *  An index past the end clamps to the start of the last paragraph, because
 *  the honest answer to "where is paragraph nine of six" is the end of the
 *  prose, never zero. */
export function offsetOfParagraph(body: string, index: number): number {
  let searchFrom = 0
  let seen = -1
  let last = 0
  for (const para of body.split(/\n{2,}/)) {
    const trimmed = para.trim()
    if (!trimmed) { searchFrom += para.length; continue }
    seen += 1
    const start = body.indexOf(trimmed, searchFrom)
    if (seen === index) return start
    last = start
    searchFrom = start + trimmed.length
  }
  return last
}

/** Is this selection a single word — the only shape a thesaurus answer means
 *  anything for?
 *
 *  The synonym pass returns drop-in replacements: same part of speech, same
 *  case. Asked about a whole sentence it has nothing coherent to return, so
 *  the menu offers it only here. Surrounding whitespace does not count — a
 *  double-click often takes the trailing space with it, and refusing that
 *  selection would be refusing the commonest way to pick one word.
 *
 *  Internal punctuation is fine: "don't", "sea-grape", and "1848," are each
 *  one word. Only whitespace inside the trimmed selection makes it more. */
export const isSingleWord = (selection: string): boolean => {
  const t = selection.trim()
  return t.length > 0 && !/\s/.test(t)
}
