import { useCallback, useEffect, useMemo, useState } from 'react'
import { yearRange } from './canon'
import type { Canon } from './canon'
import { charColors } from './presentation'
import { useServerData } from './hooks/useServerData'
import type { ServerData } from './hooks/useServerData'
import { useTimeCursor } from './hooks/useTimeCursor'
import { Timeline } from './components/Timeline'
import { MapView } from './components/MapView'
import { GraphView } from './components/GraphView'
import { ProfilePanel } from './components/ProfilePanel'
import { EventStrip } from './components/EventStrip'
import { ChatPanel } from './components/ChatPanel'
import { ManuscriptView } from './components/ManuscriptView'
import { WikiView } from './components/WikiView'

type Page = 'world' | 'manuscript' | 'wiki'

export default function App() {
  const data = useServerData()
  const [dark, setDark] = useState<boolean>(() => matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
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

  return <Shell canon={data.canon} data={data} dark={dark} onToggleDark={() => setDark(d => !d)} />
}

/** The app once canon exists — split out so the time cursor hook can rely
 *  on a non-null canon. */
function Shell({ canon, data, dark, onToggleDark }: {
  canon: Canon
  data: ServerData
  dark: boolean
  onToggleDark: () => void
}) {
  const [page, setPage] = useState<Page>('world')
  const [selectedState, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'profile' | 'chat'>('profile')

  const range = useMemo(() => yearRange(canon.timeline.eras), [canon])
  const colors = useMemo(() => charColors(canon), [canon])
  // Book time never consults dates for ordering — reading order is chapter order.
  const chapters = useMemo(() => [...(canon.chapters ?? [])].sort((a, b) => a.order - b.order), [canon])

  const time = useTimeCursor(canon, chapters, range)

  // Open on the story's own terms — its first protagonist — until the user
  // selects; derived, so no initialization effect is needed.
  const selected = selectedState
    ?? canon.story.protagonists?.find(id => canon.entities[id])
    ?? Object.keys(canon.entities)[0]
    ?? null

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
    if (p === 'world' && page === 'manuscript') time.setTimeMode('book')
    setPage(p)
  }

  const degraded = [...data.degraded, ...(data.canonError ? ['canon refresh'] : [])]

  return (
    <div className="app">
      <header className="topbar">
        <div className="toprow">
          <h1>arc</h1>
          <span className="logline">
            {canon.story.title} — {canon.story.logline}
          </span>
          <button className="themeToggle" onClick={onToggleDark}>
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
        {degraded.length > 0 && (
          <div className="degraded">
            {degraded.join(', ')} unavailable — is arc-backend running?{' '}
            <button className="themeToggle" onClick={data.retry}>Retry</button>
          </div>
        )}
      </header>

      {page === 'manuscript' && (
        <ManuscriptView scenes={data.prose} chapters={chapters}
          chapterIx={time.chapterIx} onChapter={time.setChapterIx} onOpenWorld={openWorld}
          draft={data.draft} onRefresh={data.refreshProse} />
      )}
      {page === 'wiki' && (
        <WikiView canon={canon} articles={data.docs} onOpenWorld={openWorld} />
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
          <GraphView canon={canon} tEnd={time.tEnd} selected={selected} onSelect={selectAndShow} />
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
            <ProfilePanel canon={canon} id={selected} tEnd={time.tEnd} onSelect={selectAndShow} />
          ) : (
            <ChatPanel onCanonChanged={data.refreshCanon} onSelect={selectAndShow} />
          )}
        </section>
      </div>
      </>}
    </div>
  )
}
