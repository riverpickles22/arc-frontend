import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadCanon, loadDocs, loadDraft, loadProse, loadView, yearRange, eraAt, dk, dateOf, charColors, openingYear, NO_DRAFT } from './canon'
import type { Canon, DocArticle, ProseDraft, ProseScene, View } from './canon'
import { Timeline, type TimeMode } from './components/Timeline'
import { MapView } from './components/MapView'
import { GraphView } from './components/GraphView'
import { ProfilePanel } from './components/ProfilePanel'
import { EventStrip } from './components/EventStrip'
import { ChatPanel } from './components/ChatPanel'
import { ManuscriptView } from './components/ManuscriptView'
import { WikiView } from './components/WikiView'

type Page = 'world' | 'manuscript' | 'wiki'

// Character colours are derived per story (see charColors in canon.ts) so this
// repo carries no story's cast. Entity types are the system's own vocabulary,
// so they stay fixed here.
export const TYPE_COLORS: Record<string, string> = {
  character: 'var(--c1)',
  place: 'var(--c2)',
  faction: 'var(--c3)',
  object: 'var(--c4)',
}

export default function App() {
  const [canon, setCanon] = useState<Canon | null>(null)
  const [view, setView] = useState<View>({})
  const [docs, setDocs] = useState<DocArticle[]>([])
  const [prose, setProse] = useState<ProseScene[]>([])
  const [draft, setDraft] = useState<ProseDraft>(NO_DRAFT)
  const [page, setPage] = useState<Page>('world')
  const [err, setErr] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [timeMode, setTimeMode] = useState<TimeMode>('book')   // reading order is the default lens; calendar is the toggle
  const [chapterIx, setChapterIx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'profile' | 'chat'>('profile')
  const [dark, setDark] = useState<boolean>(() => matchMedia('(prefers-color-scheme: dark)').matches)

  const refreshCanon = useCallback(() => {
    loadCanon().then(setCanon).catch(e => setErr(String(e)))
  }, [])

  // Prose and its draft state refresh together: accept/discard change both.
  const refreshProse = useCallback(() => {
    loadProse().then(setProse)
    loadDraft().then(setDraft)
  }, [])

  useEffect(() => {
    refreshCanon()
    loadView().then(setView)
    loadDocs().then(setDocs)
    refreshProse()
  }, [refreshCanon, refreshProse])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const range = useMemo(() => (canon ? yearRange(canon.timeline.eras) : ([1950, 2000] as [number, number])), [canon])
  const colors = useMemo(() => (canon ? charColors(canon) : {}), [canon])
  // Book time never consults dates for ordering — reading order is chapter order.
  const chapters = useMemo(() => [...(canon?.chapters ?? [])].sort((a, b) => a.order - b.order), [canon])

  // Open on the story's own terms — its first protagonist, at the earliest
  // year its eras cover — rather than a hardcoded character and date.
  useEffect(() => {
    if (!canon) return
    if (selected === null) {
      setSelected(canon.story.protagonists?.find(id => canon.entities[id]) ?? Object.keys(canon.entities)[0] ?? null)
    }
    if (year === null) setYear(openingYear(canon, range[0]))
  }, [canon, selected, year, range])

  // selecting anything from the chat/profile flips to profile tab
  const selectAndShow = useCallback((id: string) => {
    setSelected(id)
    setTab('profile')
  }, [])

  // From the manuscript or wiki: show this id in the world view.
  const openWorld = useCallback((id: string) => {
    setSelected(id)
    setTab('profile')
    setPage('world')
  }, [])

  // Page switch. Leaving the manuscript for the world view snaps time to
  // book mode at the manuscript's chapter — the two pages describe the same
  // moment of the same world.
  const goto = (p: Page) => {
    if (p === 'world' && page === 'manuscript') setTimeMode('book')
    setPage(p)
  }

  if (err) return <div className="empty">Failed to load canon: {err}</div>
  if (!canon || year === null) return <div className="empty">Loading canon…</div>

  // T flows downstream as a date key either way: end of the selected year, or
  // end of the current chapter's span — so map/graph/profiles need no mode.
  const bookChapter = timeMode === 'book' && chapters.length
    ? chapters[Math.min(chapterIx, chapters.length - 1)] : undefined
  const chapterEnd = bookChapter ? dateOf(bookChapter.span.end) ?? dateOf(bookChapter.span.start) : undefined
  const tEnd = chapterEnd ? dk(chapterEnd, true) : dk(String(year), true)
  const era = eraAt(tEnd, canon.timeline.eras)
  const displayYear = Math.floor(tEnd / 10000)

  // Keep the two scales in sync when switching, so T doesn't jump.
  const switchMode = (m: TimeMode) => {
    if (m === timeMode) return
    if (m === 'book' && chapters.length) {
      const inSpan = chapters.findIndex(c => {
        const s = dateOf(c.span.start), e = dateOf(c.span.end)
        return s && e && Number(s.slice(0, 4)) <= year && year <= Number(e.slice(0, 4))
      })
      const before = chapters.reduce((best, c, i) => {
        const s = dateOf(c.span.start)
        return s && Number(s.slice(0, 4)) <= year ? i : best
      }, 0)
      setChapterIx(inSpan >= 0 ? inSpan : before)
    }
    if (m === 'calendar') setYear(displayYear)
    setTimeMode(m)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="toprow">
          <h1>arc</h1>
          <span className="logline">
            {canon.story.title} — {canon.story.logline}
          </span>
          <button className="themeToggle" onClick={() => setDark(d => !d)}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </div>
        <nav className="pagenav">
          {(['world', 'manuscript', 'wiki'] as Page[]).map(p => (
            <button key={p} className={page === p ? 'sel' : ''} onClick={() => goto(p)}>
              {p === 'world' ? 'World' : p === 'manuscript' ? 'Manuscript' : 'Wiki'}
            </button>
          ))}
        </nav>
      </header>

      {page === 'manuscript' && (
        <ManuscriptView scenes={prose} chapters={chapters}
          chapterIx={chapterIx} onChapter={setChapterIx} onOpenWorld={openWorld}
          draft={draft} onRefresh={refreshProse} />
      )}
      {page === 'wiki' && (
        <WikiView canon={canon} articles={docs} onOpenWorld={openWorld} />
      )}

      {page === 'world' && <>
      <section className="panel timelinePanel">
        <h2>Timeline</h2>
        <Timeline canon={canon} year={year} range={range} onYear={setYear} era={era}
          selected={selected} onSelect={selectAndShow}
          mode={timeMode} chapters={chapters} chapterIx={chapterIx}
          onChapter={setChapterIx} onMode={switchMode} />
        <EventStrip canon={canon} year={year} selected={selected} onSelect={selectAndShow}
          mode={timeMode} chapter={bookChapter} />
      </section>

      <div className="main">
        <section className="panel col-map">
          <h2>Map — where everyone is {bookChapter ? `at the end of ch. ${bookChapter.order} (${displayYear})` : `in ${year}`}</h2>
          <MapView canon={canon} view={view} colors={colors} tEnd={tEnd}
            selected={selected} onSelect={selectAndShow} />
        </section>
        <section className="panel col-graph">
          <h2>Graph — entities &amp; relationships</h2>
          <GraphView canon={canon} tEnd={tEnd} selected={selected} onSelect={selectAndShow} />
        </section>
        <section className="panel col-profile">
          <div className="tabbar">
            <button className={tab === 'profile' ? 'tab sel' : 'tab'} onClick={() => setTab('profile')}>
              Profile
            </button>
            <button className={tab === 'chat' ? 'tab sel' : 'tab'} onClick={() => setTab('chat')}>
              ✦ Chat
            </button>
          </div>
          {tab === 'profile' ? (
            <ProfilePanel canon={canon} id={selected} tEnd={tEnd} onSelect={selectAndShow} />
          ) : (
            <ChatPanel onCanonChanged={refreshCanon} onSelect={selectAndShow} />
          )}
        </section>
      </div>
      </>}
    </div>
  )
}
