// Where the pending changes are.
//
// The draft bar counts the whole book — every scene the working tree has
// moved — but it renders pinned above whichever chapter is open. Read that
// way, "1 scene changed" over the Prologue is a promise the Prologue
// changed, and an author who believes it goes looking for a diff that lives
// in another chapter. So the bar has to say WHERE, and it has to say when
// the answer is "not here".
//
// It also has to say it in the book's own words. A change knows itself as
// `prose/ch-01/scene-01.md`, and the book knows that as sc.01-1, the scene
// of Chapter 1 — The Café. Repo paths are not author-facing language
// (CLAUDE.md rule 9), and a path the author cannot click is worse than one
// they can.
//
// Everything here is proven: which file changed is git's answer, which
// chapter holds it is the scene's own frontmatter. Nothing is inferred.
import type { Chapter, ProseChange, ProseScene } from './canon'
import { chapterLabel } from './briefing-view'

export interface PlacedChange {
  file: string
  status: ProseChange['status']
  /** The scene id, when the record knows one. A file the working tree added
   *  and canon has not seen keeps its path, because that is all it has. */
  scene: string | null
  chapter: string | null
  /** "Chapter 1 — The Café", or the chapter id when canon has no title. */
  chapterLabel: string | null
  /** true when this change is in the chapter the author is reading */
  here: boolean
}

/** Place every pending change against the chapter that holds it. A deleted
 *  scene is gone from the working tree, so its identity comes from `main` —
 *  the version at HEAD — which is exactly what `main` is for. */
export function placeChanges(
  changes: ProseChange[],
  scenes: ProseScene[],
  chapters: Chapter[],
  currentChapter: string | null,
): PlacedChange[] {
  const byFile = new Map(scenes.map(s => [s.file, s]))
  return changes.map(c => {
    const known = c.main ?? byFile.get(c.file) ?? null
    const chapter = known?.chapter ?? null
    return {
      file: c.file,
      status: c.status,
      scene: known?.scene ?? null,
      chapter,
      chapterLabel: chapter ? chapterLabel(chapter, chapters) : null,
      here: chapter !== null && chapter === currentChapter,
    }
  })
}

/** How a row names itself in the drawer: the scene, then the chapter it is
 *  in — the two facts that answer "where do I click to read this". */
export function placeLabel(p: PlacedChange): string {
  const where = p.chapterLabel ?? 'a chapter canon does not name'
  return p.scene ? `${p.scene} · ${where}` : `${p.file} · not in canon yet`
}

const scenes = (n: number) => `${n} scene${n === 1 ? '' : 's'}`

/** The summary line's middle clause: where the pending work is, relative to
 *  the chapter on screen. Four honest cases, and the one that matters most
 *  is the third — an author reading a chapter with nothing pending should be
 *  told so, not left to hunt for a diff that is somewhere else. */
export function draftWhere(placed: PlacedChange[], currentChapter: string | null): string {
  const here = placed.filter(p => p.here)
  const away = placed.filter(p => !p.here)
  if (!placed.length) return ''
  // Everything is in the chapter being read.
  if (!away.length) return `${scenes(here.length)} changed here`
  // Some here, some not: both counts, because either could be the one the
  // author is looking for.
  if (here.length) {
    return `${scenes(here.length)} changed here · ${away.length} more elsewhere`
  }
  // Nothing here at all. Name where it is when there is one place to name;
  // count the places when there are several.
  const labels = [...new Set(away.map(p => p.chapterLabel).filter((x): x is string => x !== null))]
  const known = currentChapter === null ? '' : 'nothing pending in this chapter · '
  if (labels.length === 1) return `${known}${scenes(away.length)} changed in ${labels[0]}`
  if (labels.length > 1) return `${known}${scenes(away.length)} changed in ${labels.length} other chapters`
  return `${known}${scenes(away.length)} changed`
}

/** The changes in the chapter on screen. When this is empty the Before /
 *  Changes / Proposed control has nothing to switch between here: every
 *  paragraph reads the same in all three, which is the state that had the
 *  author looking for a diff that was never on the page. */
export const changesHere = (placed: PlacedChange[]): PlacedChange[] => placed.filter(p => p.here)

export interface ChapterGroup {
  chapter: string | null
  label: string
  changes: PlacedChange[]
}

/** The waiting work, grouped by the chapter that holds it, in the order the
 *  changes arrived — which is git's order, which is the book's. The author
 *  looks for a change by where it is, so where it is has to be the heading. */
export function groupByChapter(placed: PlacedChange[]): ChapterGroup[] {
  const out: ChapterGroup[] = []
  for (const p of placed) {
    const hit = out.find(g => g.chapter === p.chapter)
    if (hit) hit.changes.push(p)
    else out.push({ chapter: p.chapter, label: p.chapterLabel ?? 'Not in canon yet', changes: [p] })
  }
  return out
}

