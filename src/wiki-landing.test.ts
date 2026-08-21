import { expect, test } from 'vitest'
import { firstParagraph, landingMd, partsOf, themesFrom } from './wiki-landing'
import type { Canon, Chapter, DocArticle } from './canon'

const article = (path: string, body: string, canon: string | null = null): DocArticle => ({ path, canon, body })

test('firstParagraph skips headings, blockquotes, lists, and tables', () => {
  const body = '# Title\n\n> Canonical data: x\n\n## Overview\n\nThe real paragraph\nspans lines.\n\nSecond.'
  expect(firstParagraph(body)).toBe('The real paragraph spans lines.')
  expect(firstParagraph('# Only\n\n- a list')).toBeUndefined()
})

test('themesFrom parses the whole vision table, not just the header row', () => {
  const vision = article('docs/vision.md', [
    '# Vision', '',
    '## Themes', '',
    '| Theme | Canon carriers |',
    '|---|---|',
    '| Loss | [[event.a]], states |',
    '| Scarcity | [[char.b]] |',
    '',
    '## Next section', 'text',
  ].join('\n'))
  const rows = themesFrom([vision])
  expect(rows).toHaveLength(2)
  expect(rows[0]).toEqual({ theme: 'Loss', carriers: '[[event.a]], states' })
  expect(rows[1].theme).toBe('Scarcity')
})

test('themesFrom returns empty without a vision doc or Themes section', () => {
  expect(themesFrom([article('docs/world.md', '## Themes\n| A | B |')])).toEqual([])
  expect(themesFrom([article('docs/vision.md', '# No themes here')])).toEqual([])
})

const ch = (order: number, title: string, part?: string): Chapter =>
  ({ id: `ch.${order}`, type: 'chapter', order, title, part, status: 'proposed', span: {}, summary: `S${order}.` }) as Chapter

test('partsOf groups by part with a Prologue group for order 0', () => {
  const parts = partsOf([ch(0, 'The Hollowing'), ch(1, 'A', 'I — One'), ch(2, 'B', 'I — One'), ch(3, 'C', 'II — Two')])
  expect(parts.map(p => [p.label, p.chapters.length])).toEqual([
    ['Prologue', 1], ['I — One', 2], ['II — Two', 1],
  ])
})

test('landingMd: lead, plot by part, excerpt fallback to summary, themes fallback', () => {
  const canon = {
    story: {
      slug: 's', title: 'The Book', logline: 'A  long\nlogline.', status: 'material',
      themes: ['fallback theme'], protagonists: ['char.a'], genre: 'fiction', setting: 'Cuba',
    },
    timeline: { eras: [] },
    entities: {
      'char.a': { id: 'char.a', type: 'character', name: 'Ana', status: 'canon', summary: 'Ana  the\nprotagonist.' },
    },
    events: {}, relationships: [], chapters: [ch(0, 'P'), ch(1, 'One', 'I')],
  } as unknown as Canon

  const md = landingMd(canon, [], new Map())
  expect(md).toContain('# The Book')
  expect(md).toContain('*A long logline.*')
  expect(md).toContain('**fiction**, set in Cuba.')
  expect(md).toContain('### Prologue')
  expect(md).toContain('**Prologue P** — S0.')
  expect(md).toContain('**1. One** — S1.')
  // no article for char.a → summary excerpt, whitespace collapsed
  expect(md).toContain('**[[char.a|Ana]]** — Ana the protagonist.')
  // no vision doc → story.themes fallback
  expect(md).toContain('- fallback theme')
})

test('landingMd prefers the article first paragraph as the excerpt', () => {
  const canon = {
    story: { slug: 's', title: 'T', logline: 'L', status: 'x', themes: [], protagonists: ['char.a'] },
    timeline: { eras: [] },
    entities: { 'char.a': { id: 'char.a', type: 'character', name: 'Ana', status: 'canon', summary: 'Short.' } },
    events: {}, relationships: [], chapters: [],
  } as unknown as Canon
  const a = article('docs/entities/characters/ana.md', '# Ana\n\nThe article paragraph.', 'char.a')
  const md = landingMd(canon, [a], new Map([['char.a', a]]))
  expect(md).toContain('**[[char.a|Ana]]** — The article paragraph.')
})

test('themes render from canon, saying what carries them and where they land', () => {
  const canon = {
    story: { title: 'T', logline: '', themes: ['a flat string nobody structured'], protagonists: [], status: 'x', slug: 't' },
    chapters: [], entities: {}, events: {}, relationships: [], timeline: { eras: [] },
    themes: [
      { id: 'theme.hollowing', name: 'The hollowing', carriers: ['place.tree'], motifs: ['the hollowing'] },
      { id: 'theme.carried', name: 'Carried but unwritten', carriers: ['char.x'] },
      { id: 'theme.wish', name: 'A wish', carriers: [] },
    ],
  } as unknown as Canon
  const md = landingMd(canon, [], new Map(), [{ scene: 'sc.00-1', motifs: ['The Hollowing'] }])
  expect(md).toContain('**The hollowing** — [[place.tree]] · on the page in sc.00-1')
  expect(md).toContain('**Carried but unwritten** — [[char.x]] · not yet on the page')
  expect(md).toContain('**A wish** — *nothing carries this yet*')
  expect(md).not.toContain('a flat string nobody structured')   // canon supersedes story.yaml
})

test('a story with no themes.yaml still falls back to the vision table', () => {
  const canon = {
    story: { title: 'T', logline: '', themes: [], protagonists: [], status: 'x', slug: 't' },
    chapters: [], entities: {}, events: {}, relationships: [], timeline: { eras: [] },
  } as unknown as Canon
  const vision = { path: 'docs/vision.md', canon: null, body: '## Themes\n\n| Theme | Canon carriers |\n|---|---|\n| Old way | [[char.y]] |\n' }
  expect(landingMd(canon, [vision], new Map())).toContain('**Old way** — [[char.y]]')
})

test('the thinnest story renders: no logline, no summaries, nothing to say', () => {
  // A brand-new story may not have said what it is yet. Absence renders as
  // absence — the landing page must never throw on a field the author has
  // not answered.
  const canon = {
    story: { title: 'The Thin Story', protagonists: ['char.nell'], themes: [], status: 'material', slug: 't' },
    chapters: [{ id: 'ch.01', type: 'chapter', order: 1, title: 'One', status: 'proposed', span: {} }],
    entities: { 'char.nell': { id: 'char.nell', type: 'character', name: 'Nell', status: 'canon' } },
    events: {}, relationships: [], timeline: { eras: [] },
  } as unknown as Canon
  const md = landingMd(canon, [], new Map())
  expect(md).toContain('# The Thin Story')
  expect(md).toContain('**1. One**')
  expect(md).not.toContain('undefined')
})
