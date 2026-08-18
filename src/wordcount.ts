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
interface CountedScene {
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
const WORDS_PER_MINUTE = 230

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

/** Words to a page — the paperback convention. Here rather than inline in the
 *  manuscript so the chapter header and the reading footer cannot round the
 *  same chapter to different lengths. */
const WORDS_PER_PAGE = 250

/** Pages in a passage. Any prose at all is at least one page; nothing drafted
 *  is no pages, the same absence `wordsByChapter` reports. */
export function pageCount(words: number): number {
  return words > 0 ? Math.max(1, Math.round(words / WORDS_PER_PAGE)) : 0
}

/** How position is stated. A Kindle lets the reader choose which of these
 *  they think in, and remembers the choice; so does this. */
export type ProgressRegister = 'page' | 'pages' | 'minutes' | 'words'

/** The cycle, in the order a click walks it: where am I → how much of this
 *  chapter is left, in pages, then minutes, then words. */
const PROGRESS_ORDER: ProgressRegister[] = ['page', 'pages', 'minutes', 'words']

export function nextRegister(r: ProgressRegister): ProgressRegister {
  return PROGRESS_ORDER[(PROGRESS_ORDER.indexOf(r) + 1) % PROGRESS_ORDER.length]
}

/** Which page the reader is on, given how far through the chapter they have
 *  scrolled. The top of a chapter is page 1 — never page 0 — and the bottom
 *  is the last page, so the number the footer states always lands inside the
 *  "of M" it is quoted against. */
export function pageAt(progress: number, pages: number): number {
  if (pages <= 0) return 0
  const p = Math.min(1, Math.max(0, progress))
  return Math.min(pages, Math.max(1, Math.ceil(p * pages)))
}

/** Words still ahead of the reader. Everything the footer says about what is
 *  LEFT derives from this one number, so pages-left, minutes-left and
 *  words-left can never tell three different stories. */
export function wordsLeft(progress: number, words: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return Math.max(0, Math.round(words * (1 - p)))
}

/** The footer's whole text, in the register the reader picked.
 *
 *  Reaching the end says so in words rather than counting down to "0 pages
 *  left" — a zero is a measurement, and what the reader wants there is the
 *  fact that the chapter is over. */
export function progressLabel(r: ProgressRegister, progress: number, words: number): string {
  const pages = pageCount(words)
  if (pages === 0) return ''
  if (r === 'page') return `Page ${pageAt(progress, pages)} of ${pages}`

  const left = wordsLeft(progress, words)
  if (left === 0) return 'End of the chapter'
  if (r === 'words') return `${formatWords(left)} words left in this chapter`
  if (r === 'minutes') return `${readingMinutes(left)} min left in this chapter`
  // pageCount, not a ceiling of its own: rounding what is left differently
  // from how the chapter was measured is how a five-page chapter comes to
  // have six pages left in it.
  const p = pageCount(left)
  return `${p} page${p === 1 ? '' : 's'} left in this chapter`
}
