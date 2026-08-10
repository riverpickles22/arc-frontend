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

export interface ProseLike {
  body: string
}

/** A pending change to a prose file (the ProseChange shape, narrowed to what
 *  copying needs). `main` is deliberately absent — copy never reads it. */
export interface ChangeLike {
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
