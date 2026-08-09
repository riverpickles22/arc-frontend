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

// The style contract (conventions §10) is written as wrapped bullets and a
// numbered checklist; before these rules every multi-line bullet shattered
// into stray paragraphs. Fixtures below are lifted from the real style.md.
test('a wrapped bullet stays one list item instead of closing the list', () => {
  const html = mdToHtml(
    '- **POV.** Prologue: omniscient, no POV character. Carlos chapters: close\n' +
    '  third. Dog chapters (Diego, Mateo): strictly behavioral and sensory.\n' +
    '- **Tense.** Past, throughout.\n')
  expect(html).toBe(
    '<ul><li><strong>POV.</strong> Prologue: omniscient, no POV character. Carlos chapters: close third. ' +
    'Dog chapters (Diego, Mateo): strictly behavioral and sensory.</li>' +
    '<li><strong>Tense.</strong> Past, throughout.</li></ul>')
  expect(html).not.toContain('<p>')          // the continuation never becomes a paragraph
})

test('the pre-draft checklist renders as an ordered list, wrapped items included', () => {
  const html = mdToHtml(
    '1. Does the scene open on smell (or smell braided with sound)? (§2)\n' +
    '2. Does any sentence interpret, explain, or name an ideology or symbol?\n' +
    '   Cut it. (§1)\n' +
    '3. Does any word, object, or image postdate the scene\'s year? (§4)\n')
  expect(html).toContain('<ol>')
  expect(html).toContain('</ol>')
  expect((html.match(/<li>/g) ?? []).length).toBe(3)
  expect(html).toContain('name an ideology or symbol? Cut it. (§1)</li>')
})

test('switching between bullet and numbered starts a new list', () => {
  const html = mdToHtml('- one\n1. two\n')
  expect(html).toBe('<ul><li>one</li></ul>\n<ol><li>two</li></ol>')
})

test('a paragraph after a blank line is still a paragraph, not a continuation', () => {
  const html = mdToHtml('- item\n\nA following paragraph.\n')
  expect(html).toBe('<ul><li>item</li></ul>\n<p>A following paragraph.</p>')
})
