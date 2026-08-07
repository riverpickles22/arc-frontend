import type { Chapter, ProseScene } from '../canon'
import { dateOf } from '../canon'
import { mdToHtml } from '../md'

/** The running manuscript: chapters in reading order, each chapter's bound
 *  scenes (conventions §10) rendered below its canon outline. Position is
 *  the same chapter index book time uses — flipping to the world view shows
 *  the graph projected at this point in the manuscript. */
export function ManuscriptView({ scenes, chapters, chapterIx, onChapter, onOpenWorld }: {
  scenes: ProseScene[]
  chapters: Chapter[]          // sorted by order
  chapterIx: number
  onChapter: (ix: number) => void
  onOpenWorld: (id: string) => void
}) {
  if (!chapters.length) return <div className="empty">No chapters in canon yet.</div>
  const cur = chapters[Math.min(chapterIx, chapters.length - 1)]
  const curScenes = scenes.filter(s => s.chapter === cur.id).sort((a, b) => a.file.localeCompare(b.file))
  const scenesOf = (id: string) => scenes.filter(s => s.chapter === id).length
  const spanText = [dateOf(cur.span.start), dateOf(cur.span.end)].filter(Boolean).join(' → ')

  const bodyClick = (ev: React.MouseEvent) => {
    const t = (ev.target as HTMLElement).closest('a.wikilink') as HTMLElement | null
    if (t) { ev.preventDefault(); onOpenWorld(t.dataset.id!) }
  }

  return (
    <div className="ms-layout">
      <nav className="side-nav">
        <h3>Chapters</h3>
        {chapters.map((c, i) => (
          <button key={c.id} className={i === chapterIx ? 'navitem sel' : 'navitem'} onClick={() => onChapter(i)}>
            <span className="chn">{c.order === 0 ? 'P' : c.order}</span> {c.title}
            <span className="chmeta">{scenesOf(c.id) ? `${scenesOf(c.id)} scene${scenesOf(c.id) === 1 ? '' : 's'}` : 'outline'}</span>
          </button>
        ))}
      </nav>

      <article className="ms-main">
        <header className="ms-head">
          <h1>{cur.order === 0 ? 'Prologue' : `Chapter ${cur.order}`} — {cur.title}</h1>
          <p className="ms-meta">{spanText}{cur.part ? ` · ${cur.part}` : ''} · <span className={`stpill ${cur.status}`}>{cur.status}</span></p>
        </header>

        <blockquote className="ms-outline">
          <span className="olabel">Outline (canon)</span>
          {cur.summary}
        </blockquote>

        {curScenes.map(s => (
          <section key={s.scene} className="scene">
            <div className="scene-head">
              <code>{s.scene}</code>
              <span className={`stpill ${s.status}`}>{s.status}</span>
              {s.pov && <a className="linklike" onClick={() => onOpenWorld(s.pov!)}>POV {s.pov}</a>}
              <span className="rests">rests on{' '}
                {[...s.facts, ...s.events].map(id => (
                  <a key={id} className="wikilink" onClick={() => onOpenWorld(id)}>{id}</a>
                ))}
              </span>
            </div>
            <div className="mdbody prose" onClick={bodyClick}
              dangerouslySetInnerHTML={{ __html: mdToHtml(s.body) }} />
          </section>
        ))}

        {!curScenes.length && (
          <p className="ms-empty">No scenes drafted yet — the outline above is this chapter's canon summary.
            Scenes land in <code>prose/ch-{String(cur.order).padStart(2, '0')}/</code> with frontmatter binding them to the facts they rest on.</p>
        )}
      </article>
    </div>
  )
}
