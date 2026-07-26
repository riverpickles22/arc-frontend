import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadCanon, loadView, yearRange, eraAt, dk, charColors, openingYear } from './canon'
import type { Canon, View } from './canon'
import { Timeline } from './components/Timeline'
import { MapView } from './components/MapView'
import { GraphView } from './components/GraphView'
import { ProfilePanel } from './components/ProfilePanel'
import { EventStrip } from './components/EventStrip'
import { ChatPanel } from './components/ChatPanel'

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
  const [err, setErr] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'profile' | 'chat'>('profile')
  const [dark, setDark] = useState<boolean>(() => matchMedia('(prefers-color-scheme: dark)').matches)

  const refreshCanon = useCallback(() => {
    loadCanon().then(setCanon).catch(e => setErr(String(e)))
  }, [])

  useEffect(() => {
    refreshCanon()
    loadView().then(setView)
  }, [refreshCanon])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const range = useMemo(() => (canon ? yearRange(canon.timeline.eras) : ([1950, 2000] as [number, number])), [canon])
  const colors = useMemo(() => (canon ? charColors(canon) : {}), [canon])

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

  if (err) return <div className="empty">Failed to load canon: {err}</div>
  if (!canon || year === null) return <div className="empty">Loading canon…</div>

  const tEnd = dk(String(year), true)
  const era = eraAt(tEnd, canon.timeline.eras)

  return (
    <div className="app">
      <header className="topbar">
        <h1>arc</h1>
        <span className="logline">
          {canon.story.title} — {canon.story.logline}
        </span>
        <button className="themeToggle" onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'} mode
        </button>
      </header>

      <section className="panel timelinePanel">
        <h2>Timeline</h2>
        <Timeline canon={canon} year={year} range={range} onYear={setYear} era={era}
          selected={selected} onSelect={selectAndShow} />
        <EventStrip canon={canon} year={year} selected={selected} onSelect={selectAndShow} />
      </section>

      <div className="main">
        <section className="panel col-map">
          <h2>Map — where everyone is in {year}</h2>
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
    </div>
  )
}
