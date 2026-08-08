// The synthesized story landing article — the wiki's front door, generated
// from canon and docs the record already holds. Pure markdown-out functions,
// extracted from WikiView so they can be tested without rendering.
import type { Canon, Chapter, DocArticle, Entity } from './canon'

/** First real paragraph of an article body — skips headings, blockquotes,
 *  lists, and tables. The excerpt shown on the story landing page. */
export function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\n{2,}/)) {
    const t = block.trim()
    if (!t || /^[#>\-*|]/.test(t)) continue
    return t.replace(/\n/g, ' ')
  }
}

/** The themes table from a hand-written vision doc, when the story has one.
 *  Hand-written docs win over anything we could synthesize. */
export function themesFrom(articles: DocArticle[]): { theme: string; carriers: string }[] {
  const vision = articles.find(a => /(^|\/)vision\.md$/.test(a.path))
  // No /m flag: $ must mean end-of-document, not end-of-line, or the lazy
  // capture stops at the first line break.
  const section = vision?.body.match(/(?:^|\n)## Themes\s*\n([\s\S]*?)(?=\n## |$)/)
  if (!section) return []
  const rows: { theme: string; carriers: string }[] = []
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    if (cells.length >= 3 && cells[1] && cells[1] !== 'Theme' && !/^[-: ]+$/.test(cells[1])) {
      rows.push({ theme: cells[1], carriers: cells[2] })
    }
  }
  return rows
}

/** Chapters grouped into the story's parts, reading order preserved. */
export function partsOf(chapters: Chapter[]): { label: string; chapters: Chapter[] }[] {
  const out: { label: string; chapters: Chapter[] }[] = []
  for (const c of chapters) {
    const label = c.part ?? (c.order === 0 ? 'Prologue' : 'Chapters')
    const last = out[out.length - 1]
    if (last && last.label === label) last.chapters.push(c)
    else out.push({ label, chapters: [c] })
  }
  return out
}

/** The landing article, as markdown. Every fact comes from canon or the
 *  docs; nothing here is authored twice. */
export function landingMd(canon: Canon, articles: DocArticle[], byCanon: Map<string, DocArticle>): string {
  const s = canon.story
  const chapters = [...canon.chapters].sort((a, b) => a.order - b.order)
  const md: string[] = [`# ${s.title}`, '']
  md.push(`*${s.logline.replace(/\s+/g, ' ').trim()}*`, '')
  if (s.genre || s.setting) {
    md.push([s.genre && `**${s.genre}**`, s.setting && `set in ${s.setting}`].filter(Boolean).join(', ') + '.', '')
  }

  const excerptOf = (e: Entity) => {
    const a = byCanon.get(e.id)
    const p = a ? firstParagraph(a.body) : undefined
    return p ?? e.summary.replace(/\s+/g, ' ').trim()
  }
  const withArticles = (type: string) => {
    const protagonists = (s.protagonists ?? []).map(id => canon.entities[id]).filter(e => e?.type === type)
    const rest = Object.values(canon.entities)
      .filter(e => e.type === type && byCanon.has(e.id) && !protagonists.includes(e))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...protagonists, ...rest]
  }

  if (chapters.length) {
    md.push('## Plot', '')
    for (const part of partsOf(chapters)) {
      if (part.label !== 'Chapters') md.push(`### ${part.label}`, '')
      for (const c of part.chapters) {
        const label = c.order === 0 ? 'Prologue' : `${c.order}.`
        md.push(`**${label} ${c.title}** — ${c.summary.replace(/\s+/g, ' ').trim()}`, '')
      }
    }
  }

  const characters = withArticles('character')
  if (characters.length) {
    md.push('## Core characters', '')
    for (const e of characters) md.push(`**[[${e.id}|${e.name}]]** — ${excerptOf(e)}`, '')
  }

  const places = withArticles('place')
  if (places.length) {
    md.push('## Places', '')
    for (const e of places) md.push(`**[[${e.id}|${e.name}]]** — ${excerptOf(e)}`, '')
  }

  const themes = themesFrom(articles)
  md.push('## Themes & metaphors', '')
  if (themes.length) for (const t of themes) md.push(`- **${t.theme}** — ${t.carriers}`)
  else for (const t of s.themes ?? []) md.push(`- ${t}`)

  return md.join('\n')
}
