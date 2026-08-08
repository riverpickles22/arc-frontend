// Pins the markdown renderer's behavior — including the escape-first
// ordering that dangerouslySetInnerHTML safety rests on.
import { expect, test } from 'vitest'
import { mdToHtml, slugOf } from './md'

test('paragraphs, headings with anchor ids, lists, quotes, hr', () => {
  const html = mdToHtml('# Title\n\nA para.\n\n## Section two\n\n- one\n- two\n\n> quoted\n\n---\n')
  expect(html).toContain('<h1 id="title">Title</h1>')
  expect(html).toContain('<h2 id="section-two">Section two</h2>')
  expect(html).toContain('<p>A para.</p>')
  expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
  expect(html).toContain('<blockquote>quoted</blockquote>')
  expect(html).toContain('<hr>')
})

test('inline: bold, italic, code, wikilinks with and without labels', () => {
  const html = mdToHtml('**bold** and *ital* and `code` and [[char.carlos]] and [[place.cafe|the café]]')
  expect(html).toContain('<strong>bold</strong>')
  expect(html).toContain('<em>ital</em>')
  expect(html).toContain('<code>code</code>')
  expect(html).toContain('<a class="wikilink" data-id="char.carlos">char.carlos</a>')
  expect(html).toContain('<a class="wikilink" data-id="place.cafe">the café</a>')
})

test('html in source is escaped before any tags are added', () => {
  const html = mdToHtml('<script>alert(1)</script> & <b>x</b>')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('&amp;')
})

test('slugOf strips entities so renderer and TOC agree on anchors', () => {
  expect(slugOf('Themes & metaphors')).toBe('themes-metaphors')
  expect(slugOf('Themes &amp; metaphors')).toBe('themes-metaphors')
  expect(slugOf('  Plot  ')).toBe('plot')
})
