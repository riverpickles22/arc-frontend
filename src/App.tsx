import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadGraph } from 'arc-canon-graph'
import { yearRange } from './canon'
import type { Canon } from './canon'
import { charColors } from './presentation'
import { focusSet, type FocusMode } from './graph-focus'
import { useServerData } from './hooks/useServerData'
import type { ServerData } from './hooks/useServerData'
import { useTimeCursor } from './hooks/useTimeCursor'
import { Timeline } from './components/Timeline'
import { MapView } from './components/MapView'
import { GraphView } from './components/GraphView'
import { ProfilePanel } from './components/ProfilePanel'
import { EventStrip } from './components/EventStrip'
import { AttentionInbox } from './components/AttentionInbox'
import { MaterialDrawer } from './components/MaterialDrawer'
import { ManuscriptView } from './components/ManuscriptView'
import { WikiView } from './components/WikiView'
import { StyleView, type StyleTab } from './components/StyleView'

type Page = 'world' | 'manuscript' | 'wiki' | 'style'

// Labels live in a lookup, not a ternary chain: a chain's final `else` label
// silently mislabels every page added after it.
const PAGE_LABEL: Record<Page, string> = {
  world: 'World', manuscript: 'Manuscript', wiki: 'Wiki', style: 'Style',
}

// ---- URL routes ---------------------------------------------------------
// Hash routes make every position refresh-safe and copyable, speaking the
// reference grammar (conventions §7):
//   #/world/char.carlos@ch.10-return   selection + world moment
//   #/world/@1959                      moment only
//   #/manuscript/ch.05-the-denunciation
//   #/wiki/docs/entities/characters/carlos.md   (bare #/wiki = landing)
interface Route {
  page: Page
  id?: string
  anchor?: string
  chapterId?: string
  wikiPath?: string
  styleTab?: StyleTab
}

function parseHash(): Route {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  const [head, ...rest] = h.split('/')
  if (head === 'manuscript') return { page: 'manuscript', chapterId: rest[0] || undefined }
  if (head === 'wiki') return { page: 'wiki', wikiPath: rest.join('/') || undefined }
  if (head === 'style') return { page: 'style', styleTab: rest[0] === 'author' ? 'author' : 'book' }
  if (head === 'world') {
    const tail = rest.join('/')
    const at = tail.indexOf('@')
    if (at === -1) return { page: 'world', id: tail || undefined }
    return { page: 'world', id: tail.slice(0, at) || undefined, anchor: tail.slice(at + 1) || undefined }
  }
  return { page: 'world' }
}

/** The author's theme choice, if they have made one. Storage can throw —
 *  private windows, disabled cookies — and a viewer that will not open
 *  because it could not read a preference is a worse failure than a viewer in
 *  the wrong colours. */
const THEME_KEY = 'arc.theme'
function readTheme(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}
function writeTheme(v: 'light' | 'dark'): void {
  try { localStorage.setItem(THEME_KEY, v) } catch { /* preference is a nicety */ }
}

export default function App() {
  const data = useServerData()
  // Three states, not two. A stored choice is the author's and wins; with
  // nothing stored arc follows the machine — and keeps following it, so a
  // laptop that switches at dusk carries the viewer with it. Only an explicit
  // toggle is remembered, so "follow the system" stays a real state rather
  // than a value that happens to match today.
  const [dark, setDark] = useState<boolean>(() => {
    const stored = readTheme()
    return stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (readTheme()) return   // the author has chosen; the machine no longer speaks
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const follow = (ev: MediaQueryListEvent) => setDark(ev.matches)
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [dark])

  if (data.canonError && !data.canon) {
    return (
      <div className="empty">
        Failed to load canon: {data.canonError}{' '}
        <button className="themeToggle" onClick={data.retry}>Retry</button>
      </div>
    )
  }
  if (!data.canon) return <div className="empty">Loading canon…</div>

  return <Shell canon={data.canon} data={data} dark={dark}
    onToggleDark={() => setDark(d => { writeTheme(!d ? 'dark' : 'light'); return !d })} />
}

/** The app once canon exists — split out so the time cursor hook can rely
 *  on a non-null canon. */
function Shell({ canon, data, dark, onToggleDark }: {
  canon: Canon
  data: ServerData
  dark: boolean
  onToggleDark: () => void
}) {
  // The route is read once at mount; from then on state drives the URL.
  const [route] = useState<Route>(parseHash)
  const [page, setPage] = useState<Page>(route.page)
  const [selectedState, setSelected] = useState<string | null>(route.id ?? null)
  const [wikiPath, setWikiPath] = useState<string | null>(route.wikiPath ?? null)
  const [styleTab, setStyleTab] = useState<StyleTab>(route.styleTab ?? 'book')
  const [povMode, setPovMode] = useState(false)   // "through their eyes" on the selected character
  const [focusMode, setFocusMode] = useState<FocusMode>('all')   // graph focus: chapter / selection / all

  const range = useMemo(() => yearRange(canon.timeline.eras), [canon])
  const colors = useMemo(() => charColors(canon), [canon])
  // Book time never consults dates for ordering — reading order is chapter order.
  const chapters = useMemo(() => [...(canon.chapters ?? [])].sort((a, b) => a.order - b.order), [canon])

  const time = useTimeCursor(canon, chapters, range,
    route.page === 'manuscript' ? { chapterId: route.chapterId }
      : route.anchor ? (/^\d{1,4}$/.test(route.anchor) ? { year: Number(route.anchor) } : { chapterId: route.anchor })
        : undefined)

  // Open on the story's own terms — its first protagonist — until the user
  // selects; derived, so no initialization effect is needed.
  const selected = selectedState
    ?? canon.story.protagonists?.find(id => canon.entities[id])
    ?? Object.keys(canon.entities)[0]
    ?? null

  // Selection clarity: selecting a chapter also moves the world's projection
  // to it — "what I selected" and "where I am" converge for chapters.
  // Entities and events select without moving time; events that sit outside
  // the world's moment say so in the profile instead.
  const isChapter = useCallback((id: string) => (canon.chapters ?? []).some(c => c.id === id), [canon])

  const selectAndShow = useCallback((id: string) => {
    setSelected(id)
    if (isChapter(id)) time.goToChapter(id)
  }, [isChapter, time])

  // From the manuscript or wiki: show this id in the world view.
  const openWorld = useCallback((id: string) => {
    setSelected(id)
    setPage('world')
    if (isChapter(id)) time.goToChapter(id)
  }, [isChapter, time])

  // Page switch. Leaving the manuscript for the world view snaps time to
  // book mode at the manuscript's chapter — the two pages describe the same
  // moment of the same world.
  const goto = (p: Page) => {
    if (p === 'world' && page === 'manuscript') time.setTimeMode('book')
    setPage(p)
  }

  // Keep the URL current — replaceState, so refresh and copy keep the spot
  // without flooding history.
  const bookChapterId = time.bookChapter?.id
  const curChapterId = chapters[Math.min(time.chapterIx, chapters.length - 1)]?.id
  useEffect(() => {
    let h = '#/' + page
    if (page === 'world') {
      const anchor = time.timeMode === 'book' ? bookChapterId : String(time.year)
      if (selected) h += '/' + selected + (anchor ? '@' + anchor : '')
      else if (anchor) h += '/@' + anchor
    } else if (page === 'manuscript' && curChapterId) {
      h += '/' + curChapterId
    } else if (page === 'wiki' && wikiPath) {
      h += '/' + wikiPath
    } else if (page === 'style' && styleTab !== 'book') {
      h += '/' + styleTab
    }
    history.replaceState(null, '', h)
  }, [page, selected, time.timeMode, time.year, bookChapterId, curChapterId, wikiPath, styleTab])

  // The selected character's world as of T (event-level POV; conventions'
  // dramatic-irony view). Only computed while the toggle is on.
  const selectedIsChar = selected != null && canon.entities[selected]?.type === 'character'
  const povView = useMemo(
    () => (povMode && selectedIsChar ? loadGraph(canon).povView(selected!, time.tEnd) : null),
    [povMode, selectedIsChar, canon, selected, time.tEnd],
  )
  const povDim = useMemo(
    () => (povView ? new Set([selected!, ...povView.met, ...povView.places]) : null),
    [povView, selected],
  )

  // Graph focus modes (dimming over re-layout). POV wins while active — it is
  // the stronger, deliberately-toggled statement about what to show.
  const curChapter = chapters[Math.min(time.chapterIx, chapters.length - 1)]
  const focusDim = useMemo(
    () => focusSet(focusMode, canon, curChapter, data.prose, selected),
    [focusMode, canon, curChapter, data.prose, selected],
  )
  const graphDim = povDim ?? focusDim

  const degraded = [...data.degraded, ...(data.canonError ? ['canon refresh'] : [])]

  return (
    <div className="app">
      <header className="topbar">
        <div className="toprow">
          <h1>arc</h1>
          <span className="logline">
            {canon.story.title} — {canon.story.logline}
          </span>
          <MaterialDrawer items={data.material} canon={canon} onOpen={openWorld} />
          <AttentionInbox attention={data.attention} canon={canon} onOpen={openWorld} />
          <button className="themeToggle" onClick={data.retry}
            title="Reload canon, docs, and prose — picks up edits made from Claude sessions">
            Refresh
          </button>
          <button className="themeToggle" onClick={onToggleDark}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </div>
        <nav className="pagenav">
          {(Object.keys(PAGE_LABEL) as Page[]).map(p => (
            <button key={p} className={page === p ? 'sel' : ''} onClick={() => goto(p)}>
              {PAGE_LABEL[p]}
            </button>
          ))}
        </nav>
        {degraded.length > 0 && (
          <div className="degraded">
            {degraded.join(', ')} unavailable — is arc-backend running?{' '}
            <MaterialDrawer items={data.material} canon={canon} onOpen={openWorld} />
          <AttentionInbox attention={data.attention} canon={canon} onOpen={openWorld} />
          <button className="themeToggle" onClick={data.retry}>Retry</button>
          </div>
        )}
      </header>

      {page === 'manuscript' && (
        <ManuscriptView scenes={data.prose} chapters={chapters}
          chapterIx={time.chapterIx} onChapter={time.setChapterIx} onOpenWorld={openWorld}
          draft={data.draft} notes={data.notes} onRefresh={data.refreshProse}
          onRefreshNotes={data.refreshNotes} onCanonChanged={data.refreshCanon} />
      )}
      {page === 'style' && (
        <StyleView style={data.style} tab={styleTab} onTab={setStyleTab} onRefresh={data.refreshStyle} />
      )}
      {page === 'wiki' && (
        <WikiView canon={canon} articles={data.docs} scenes={data.prose} onOpenWorld={openWorld}
          sel={wikiPath} onSel={setWikiPath} />
      )}

      {page === 'world' && <>
      <section className="panel timelinePanel">
        <h2>Timeline</h2>
        <Timeline canon={canon} chapters={chapters} range={range} time={time}
          selected={selected} onSelect={selectAndShow} />
        <EventStrip canon={canon} year={time.year} selected={selected} onSelect={selectAndShow}
          mode={time.timeMode} chapter={time.bookChapter} />
      </section>

      <div className="main">
        <section className="panel col-map">
          <h2>Map — where everyone is {time.bookChapter ? `at the end of ch. ${time.bookChapter.order} (${time.displayYear})` : `in ${time.year}`}</h2>
          <MapView canon={canon} view={data.view} colors={colors} tEnd={time.tEnd}
            selected={selected} onSelect={selectAndShow} />
        </section>
        <section className="panel col-graph">
          <h2>Graph — entities &amp; relationships</h2>
          <GraphView canon={canon} tEnd={time.tEnd} selected={selected} onSelect={selectAndShow} dimTo={graphDim}
            focus={{ mode: focusMode, onMode: setFocusMode }} />
        </section>
        <section className="panel col-profile">
          <h2>Profile</h2>
          <ProfilePanel canon={canon} id={selected} tEnd={time.tEnd} onSelect={selectAndShow} prose={data.prose}
            onJumpTo={time.goToKey}
            refAnchor={time.timeMode === 'book' ? time.bookChapter?.id : String(time.year)}
            pov={selectedIsChar ? { active: povMode, view: povView, onToggle: () => setPovMode(m => !m) } : undefined} />
        </section>
      </div>
      </>}
    </div>
  )
}
