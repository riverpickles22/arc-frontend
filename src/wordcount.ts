// How long is this chapter, in words?
//
// The count is of the *prose* and nothing else: scene bodies only, never
// frontmatter, scene ids, contracts, or the chapter's canon outline. A
// manuscript's length is what a reader would read.
//
// Markdown markers are not words. A scene divider (`***`), a setext rule, an
// em dash standing alone on its own — none of these are things anyone counts,
// so a token has to carry at least one letter or digit to be a word. That one
// rule keeps the number honest without pretending to parse markdown.

/** Words in a passage of prose. */
export function countWords(body: string): number {
  if (!body) return 0
  let n = 0
  for (const token of body.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) n++
  }
  return n
}

/** Grouped shape of what the viewer holds: a scene knows its chapter. */
export interface CountedScene {
  chapter: string
  body: string
}

/** Words per chapter id. Chapters with no drafted prose are absent — an
 *  outline-only chapter has no length yet, and reporting 0 would read as a
 *  measurement rather than an absence. */
export function wordsByChapter(scenes: CountedScene[]): Map<string, number> {
  const by = new Map<string, number>()
  for (const s of scenes) {
    const n = countWords(s.body)
    if (n === 0) continue
    by.set(s.chapter, (by.get(s.chapter) ?? 0) + n)
  }
  return by
}

/** Total across every drafted scene. */
export function totalWords(scenes: CountedScene[]): number {
  return scenes.reduce((acc, s) => acc + countWords(s.body), 0)
}

/** Thousands-separated, because five-figure manuscripts are unreadable
 *  without it. */
export function formatWords(n: number): string {
  return n.toLocaleString('en-US')
}

/** Silent-reading pace for prose. A single constant, shared by every surface
 *  that quotes a time, so two places can never disagree about how long the
 *  book takes to read. */
export const WORDS_PER_MINUTE = 230

/** Minutes at reading pace. Any prose at all rounds up to a minute — "0 min"
 *  reads as an error rather than a short scene. */
export function readingMinutes(words: number): number {
  return words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0
}

/** "8 min" for a chapter, "6 hr 31 min" for a book. Nothing drafted reads as
 *  the empty string — the caller decides whether to show anything at all. */
export function formatReadingTime(words: number): string {
  const mins = readingMinutes(words)
  if (mins === 0) return ''
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `${hrs} hr ${rest} min` : `${hrs} hr`
}
