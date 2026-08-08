// Click delegation for rendered [[wikilinks]] — md.ts emits
// <a class="wikilink" data-id>, the caller decides where an id goes.
import type React from 'react'

export const wikilinkClickHandler = (onId: (id: string) => void): React.MouseEventHandler =>
  ev => {
    const t = (ev.target as HTMLElement).closest('a.wikilink') as HTMLElement | null
    if (t?.dataset.id) {
      ev.preventDefault()
      onId(t.dataset.id)
    }
  }
