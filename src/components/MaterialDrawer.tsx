// Story material (conventions §12): the unplaced layer's drawer — what the
// author is considering, before it has a home. Inventory, never guilt.
import { useState } from 'react'
import type { Canon, MaterialItem } from '../canon'
import { nameOf } from '../canon'

const TYPE_LABEL: Record<MaterialItem['type'], string> = {
  'character-need': 'character needs',
  'unplaced-scene': 'unplaced scenes',
  'motif-idea': 'motif ideas',
  relationship: 'relationships',
  obligation: 'obligations',
  gap: 'gaps',
}

export function MaterialDrawer({ items, canon, onOpen }: {
  items: MaterialItem[]
  canon: Canon
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = items.filter(i => i.status === 'unplaced')
  if (!items.length) return null

  const groups = new Map<string, MaterialItem[]>()
  for (const i of active) {
    const label = TYPE_LABEL[i.type] ?? i.type
    groups.set(label, [...(groups.get(label) ?? []), i])
  }
  const resolved = items.filter(i => i.status !== 'unplaced')

  return (
    <>
      <button className="attn-chip" onClick={() => setOpen(o => !o)}
        title="Story material — creative material that has not found its place yet (conventions §12)">
        ✎ Material {active.length}
      </button>
      {open && (
        <div className="attn-drawer">
          {[...groups.entries()].map(([label, list]) => (
            <div key={label} className="attn-group">
              <h3>{label}</h3>
              {list.map(item => (
                <div key={item.id} className="mat-item">
                  <div className="mat-body">{item.body.trim()}</div>
                  {item.purpose && <div className="mat-purpose">{item.purpose.trim()}</div>}
                  {item.constraints?.length ? (
                    <ul className="mat-constraints">
                      {item.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  ) : null}
                  <div className="mat-meta">
                    <code>{item.id}</code>
                    {item.window?.from && (
                      <span className="badge">window {item.window.from === item.window.to
                        ? item.window.from : `${item.window.from} → ${item.window.to ?? '…'}`}</span>
                    )}
                    {item.related?.map(id => (
                      <a key={id} className="linklike" onClick={() => { onOpen(id); setOpen(false) }}>
                        {nameOf(canon, id)}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {active.length === 0 && <div className="attn-group"><h3>nothing unplaced</h3></div>}
          {resolved.length > 0 && (
            <div className="attn-group">
              <h3>resolved</h3>
              <div className="attn-chips">
                {resolved.map(i => (
                  <span key={i.id} className="badge" title={i.body}>{i.id} · {i.status}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
