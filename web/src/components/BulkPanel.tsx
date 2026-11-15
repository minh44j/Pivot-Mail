import { useSettings } from '../settings'
import type { Colour } from '../types'
import { Icon } from './Icon'

interface Props {
  subjects: string[]
  count: number
  anyUnread: boolean
  allFlagged: boolean
  allImportant: boolean
  onDelete: () => void
  onArchive: () => void
  onMove: () => void
  onToggleRead: () => void
  onToggleFlag: () => void
  onToggleImportant: () => void
  onColour: (c: Colour | undefined) => void
  onClear: () => void
}

/** Shown in place of the reading pane when several conversations are selected. */
export function BulkPanel(p: Props) {
  const { colours } = useSettings()
  return (
    <section className="reader bulk" aria-label="Selected conversations">
      <div className="bulk-card">
        <h2>{p.count} conversations selected</h2>
        <p className="muted">Actions apply to all of them. Press Esc to clear the selection.</p>
        <div className="bulk-actions" role="group" aria-label="Actions for the selection">
          <button type="button" className="btn" onClick={p.onDelete}>
            <Icon name="trash" size={16} tone="red" /> Delete
          </button>
          <button type="button" className="btn" onClick={p.onArchive}>
            <Icon name="archive" size={16} tone="purple" /> Archive
          </button>
          <button type="button" className="btn" onClick={p.onMove}>
            <Icon name="folder" size={16} tone="gray" /> Move to…
          </button>
          <button type="button" className="btn" onClick={p.onToggleRead}>
            <Icon name="eye" size={16} tone="blue" /> {p.anyUnread ? 'Mark as read' : 'Mark as unread'}
          </button>
          <button type="button" className="btn" onClick={p.onToggleFlag}>
            <Icon name="flag" size={16} tone="orange" /> {p.allFlagged ? 'Remove flag' : 'Flag'}
          </button>
          <button type="button" className="btn" onClick={p.onToggleImportant}>
            <Icon name="important" size={16} tone="red" /> {p.allImportant ? 'Remove importance' : 'Mark important'}
          </button>
        </div>
        <div className="bulk-colours" role="group" aria-label="Colour category">
          <span className="muted">Colour category</span>
          {colours.map((c) => (
            <button key={c.id} type="button" className={`swatch-btn c-${c.id}`} aria-label={`Apply ${c.label}`} onClick={() => p.onColour(c.id)} />
          ))}
          <button type="button" className="swatch-btn none" aria-label="Clear colour category" onClick={() => p.onColour(undefined)}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <ul className="bulk-list">
          {p.subjects.slice(0, 6).map((s, i) => (
            <li key={`${s}-${i}`}>{s}</li>
          ))}
          {p.subjects.length > 6 && <li className="muted">and {p.subjects.length - 6} more</li>}
        </ul>
        <button type="button" className="btn quiet" onClick={p.onClear}>
          Clear selection
        </button>
      </div>
    </section>
  )
}
