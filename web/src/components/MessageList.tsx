import { useEffect, useMemo, useRef, useState } from 'react'
import type { Density, Row } from '../types'
import { formatListTime, groupLabel } from '../util'
import { useSettings } from '../settings'
import { Icon } from './Icon'

/** Phones and narrow windows get taller rows so the touch-sized buttons fit. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 899px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

interface Props {
  rows: Row[]
  selectedId: string | null
  density: Density
  unreadOnly: boolean
  title: string
  subtitle: string
  onUnreadOnly: (v: boolean) => void
  onSelect: (id: string) => void
  onBack: () => void
  onContext: (id: string, x: number, y: number) => void
  onRowAction: (id: string, action: 'delete' | 'archive' | 'flag' | 'unread') => void
  emptyText: string
  sync: { state: 'synced' | 'syncing' | 'offline'; last: Date }
  onSync: () => void
}

type Item = { type: 'head'; label: string; key: string } | { type: 'row'; row: Row; key: string }

/** Minimal windowing: only rows near the viewport are in the DOM. */
export function MessageList({ rows, selectedId, density, unreadOnly, title, subtitle, onUnreadOnly, onSelect, onBack, onContext, onRowAction, emptyText, sync, onSync }: Props) {
  const { colours } = useSettings()
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const narrow = useNarrow()
  const rowH = density === 'compact' ? (narrow ? 64 : 52) : narrow ? 88 : 72
  const headH = 28

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    let last = ''
    for (const row of rows) {
      const label = groupLabel(row.msg.date)
      if (label !== last) {
        out.push({ type: 'head', label, key: `h-${label}` })
        last = label
      }
      out.push({ type: 'row', row, key: row.msg.id })
    }
    return out
  }, [rows])

  const offsets = useMemo(() => {
    const o: number[] = []
    let y = 0
    for (const it of items) {
      o.push(y)
      y += it.type === 'head' ? headH : rowH
    }
    return { o, total: y }
  }, [items, rowH])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Keep the selected row in view (keyboard navigation).
  useEffect(() => {
    const el = scroller.current
    if (!el || !selectedId) return
    const idx = items.findIndex((i) => i.type === 'row' && i.row.msg.id === selectedId)
    if (idx < 0) return
    const top = offsets.o[idx] ?? 0
    if (top < el.scrollTop) el.scrollTop = top - headH
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight
  }, [selectedId, items, offsets, rowH])

  const start = Math.max(0, offsets.o.findIndex((y) => y + rowH >= scrollTop) - 4)
  let end = start
  while (end < items.length && (offsets.o[end] ?? 0) < scrollTop + height + rowH * 4) end++

  return (
    <section className="list" aria-label="Message list">
      <header className="list-head">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Back to folders">
          <Icon name="back" />
        </button>
        <h2>
          {title}
          <small>{subtitle}</small>
        </h2>
        <div className="seg" role="group" aria-label="Filter">
          <button type="button" className={!unreadOnly ? 'on' : ''} onClick={() => onUnreadOnly(false)}>
            All
          </button>
          <button type="button" className={unreadOnly ? 'on' : ''} onClick={() => onUnreadOnly(true)}>
            Unread
          </button>
        </div>
      </header>
      <div className="scroller" ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="list" aria-label="Messages" tabIndex={0}>
        {rows.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          <div style={{ height: offsets.total, position: 'relative' }}>
            {items.slice(start, end).map((it, i) => {
              const y = offsets.o[start + i] ?? 0
              if (it.type === 'head') {
                return (
                  <div key={it.key} className="group-head" style={{ position: 'absolute', top: y, height: headH }}>
                    {it.label}
                  </div>
                )
              }
              const { msg, count, unread } = it.row
              const sel = msg.id === selectedId
              return (
                <div
                  key={it.key}
                  role="listitem"
                  aria-current={sel ? 'true' : undefined}
                  className={`row${sel ? ' sel' : ''}${unread ? ' unread' : ''}${msg.colour ? ` tint-${msg.colour}` : ''}`}
                  style={{ position: 'absolute', top: y, height: rowH }}
                  onClick={() => onSelect(msg.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-pivot-msg', msg.id)
                    e.dataTransfer.setData('text/plain', msg.subject)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContext(msg.id, e.clientX, e.clientY)
                  }}
                >
                  <span className={`udot${unread ? ' on' : ''}`} role="img" aria-label={unread ? 'Unread' : ''} aria-hidden={!unread} />
                  <div className="row-main">
                    <div className="row-top">
                      <span className="from">{msg.folder === 'sent' || msg.folder === 'drafts' ? `To: ${msg.to[0]?.name ?? ''}` : msg.from.name}</span>
                      {count > 1 && <span className="thread-count">{count}</span>}
                      <span className="time">{formatListTime(msg.date)}</span>
                    </div>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button type="button" title="Delete" aria-label={`Delete: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'delete')}>
                        <Icon name="trash" size={15} />
                      </button>
                      <button type="button" className="ra-extra" title="Archive" aria-label={`Archive: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'archive')}>
                        <Icon name="archive" size={15} />
                      </button>
                      <button type="button" title={msg.flagged ? 'Remove flag' : 'Flag'} aria-label={`${msg.flagged ? 'Remove flag' : 'Flag'}: ${msg.subject}`} aria-pressed={msg.flagged} onClick={() => onRowAction(msg.id, 'flag')}>
                        <Icon name="flag" size={15} />
                      </button>
                      <button type="button" className="ra-extra" title={unread ? 'Mark as read' : 'Mark as unread'} aria-label={`${unread ? 'Mark as read' : 'Mark as unread'}: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'unread')}>
                        <Icon name="eye" size={15} />
                      </button>
                      <button
                        type="button"
                        title="More: colour, move"
                        aria-label={`More actions: ${msg.subject}`}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect()
                          onContext(msg.id, r.left - 180, r.bottom + 4)
                        }}
                      >
                        <Icon name="more" size={15} />
                      </button>
                    </div>
                    <div className="row-sub">
                      <span className="subject">{msg.subject}</span>
                      {msg.attachments.length > 0 && (
                        <span className="icon-inline" title={`${msg.attachments.length} attachment(s)`}>
                          <Icon name="clip" size={14} />
                        </span>
                      )}
                      {msg.colour && (
                        <span className={`dot c-${msg.colour}`} title={`Category: ${colours.find((c) => c.id === msg.colour)?.label ?? ''}`} />
                      )}
                    </div>
                    {density === 'comfortable' && <div className="preview">{msg.body.replace(/\s+/g, ' ')}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <footer className="list-foot" aria-live="polite">
        <span className={`sync-dot ${sync.state}`} aria-hidden="true" />
        <span className="grow">
          {sync.state === 'offline'
            ? 'Offline. Changes will sync when you reconnect.'
            : sync.state === 'syncing'
              ? 'Syncing…'
              : `Synced ${sync.last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · sample data`}
        </span>
        <button type="button" className="link" onClick={onSync} disabled={sync.state !== 'synced'}>
          Sync now
        </button>
      </footer>
    </section>
  )
}
