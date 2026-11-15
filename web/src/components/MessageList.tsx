import { useEffect, useMemo, useRef, useState } from 'react'
import type { Density, Row } from '../types'
import { formatListTime, groupLabel, initials } from '../util'
import { Icon } from './Icon'

interface Props {
  rows: Row[]
  selectedId: string | null
  density: Density
  query: string
  unreadOnly: boolean
  title: string
  onQuery: (q: string) => void
  onUnreadOnly: (v: boolean) => void
  onSelect: (id: string) => void
  onBack: () => void
}

type Item = { type: 'head'; label: string; key: string } | { type: 'row'; row: Row; key: string }

/** Minimal windowing: only rows near the viewport are in the DOM. */
export function MessageList({ rows, selectedId, density, query, unreadOnly, title, onQuery, onUnreadOnly, onSelect, onBack }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const rowH = density === 'compact' ? 52 : 72
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
        <h2>{title}</h2>
        <div className="seg" role="group" aria-label="Filter">
          <button type="button" className={!unreadOnly ? 'on' : ''} onClick={() => onUnreadOnly(false)}>
            All
          </button>
          <button type="button" className={unreadOnly ? 'on' : ''} onClick={() => onUnreadOnly(true)}>
            Unread
          </button>
        </div>
      </header>
      <label className="search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search mail  (try from: or has:attachment)"
          aria-label="Search mail"
        />
      </label>
      <div className="scroller" ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="listbox" aria-label="Messages" tabIndex={0}>
        {rows.length === 0 ? (
          <div className="empty">No messages</div>
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
                  role="option"
                  aria-selected={sel}
                  className={`row${sel ? ' sel' : ''}${unread ? ' unread' : ''}${msg.colour ? ` tint-${msg.colour}` : ''}`}
                  style={{ position: 'absolute', top: y, height: rowH }}
                  onClick={() => onSelect(msg.id)}
                >
                  <span className={`stripe${msg.colour ? ` c-${msg.colour}` : ''}`} />
                  <span className="avatar" aria-hidden="true">
                    {initials(msg.from.name)}
                  </span>
                  <div className="row-main">
                    <div className="row-top">
                      <span className="from">{msg.folder === 'sent' || msg.folder === 'drafts' ? `To: ${msg.to[0]?.name ?? ''}` : msg.from.name}</span>
                      {count > 1 && <span className="thread-count">{count}</span>}
                      <span className="time">{formatListTime(msg.date)}</span>
                    </div>
                    <div className="row-sub">
                      <span className="subject">{msg.subject}</span>
                      {msg.attachments.length > 0 && (
                        <span className="icon-inline" title={`${msg.attachments.length} attachment(s)`}>
                          <Icon name="clip" size={14} />
                        </span>
                      )}
                      {msg.flagged && (
                        <span className="icon-inline flag" title="Flagged">
                          <Icon name="flag" size={14} />
                        </span>
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
    </section>
  )
}
