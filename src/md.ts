// A deliberately small markdown renderer for story docs and prose — covers
// what conventions.md-shaped articles use (h1-h3, lists, blockquotes,
// bold/italic/code, ---, [[wikilinks]]), not general markdown. Escape-first,
// then add tags; [[id]] / [[id|label]] become <a class="wikilink" data-id>
// for the caller to wire.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Anchor id for a heading — shared with the wiki TOC so links resolve.
 *  Entities are stripped first: the renderer slugs escaped text, the TOC
 *  slugs raw text, and both must land on the same id. */
export const slugOf = (s: string) =>
  s.replace(/&(amp|lt|gt);/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const inline = (s: string) =>
  s
    .replace(/\[\[([a-z]+\.[a-z0-9.-]+)\|([^\]]+)\]\]/g, '<a class="wikilink" data-id="$1">$2</a>')
    .replace(/\[\[([a-z]+\.[a-z0-9.-]+)\]\]/g, '<a class="wikilink" data-id="$1">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')

export function mdToHtml(md: string): string {
  const out: string[] = []
  let para: string[] = []
  let list: string[] | null = null
  let quote: string[] | null = null

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } }
  const flushList = () => { if (list) { out.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = null } }
  const flushQuote = () => { if (quote) { out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`); quote = null } }
  const flushAll = () => { flushPara(); flushList(); flushQuote() }

  for (const raw of esc(md).split('\n')) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,3}) (.*)$/)
    if (h) { flushAll(); out.push(`<h${h[1].length} id="${slugOf(h[2])}">${inline(h[2])}</h${h[1].length}>`); continue }
    if (/^---+$/.test(line)) { flushAll(); out.push('<hr>'); continue }
    if (line.startsWith('&gt;')) { flushPara(); flushList(); (quote ??= []).push(line.replace(/^&gt;\s?/, '')); continue }
    const li = line.match(/^[-*] (.*)$/)
    if (li) { flushPara(); flushQuote(); (list ??= []).push(li[1]); continue }
    if (!line.trim()) { flushAll(); continue }
    flushList(); flushQuote()
    para.push(line.trim())
  }
  flushAll()
  return out.join('\n')
}
