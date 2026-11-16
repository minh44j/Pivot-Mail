import { useEffect, useMemo, useRef, useState } from 'react'
import type { Density, Row } from '../types'
import { formatListTime, groupLabel } from '../util'
import { useSettings } from '../settings'
import { SMART } from '../smart'
import type { SmartKey } from '../smart'
import { fmtWhen } from '../when'
import { Icon } from './Icon'

interface Props {
  chips: string[]
  onRemoveChip: (tok: string) => void
  allFolders: boolean
  rows: Row[]
  selectedId: string | null
  density: Density
  smart: SmartKey[]
  smartCounts: Record<SmartKey, number>
  showSmart: boolean
  onToggleSmart: (k: SmartKey) => void
  title: string
  subtitle: string
  picked: string[]
  onRowClick: (id: string, mods: { ctrl: boolean; shift: boolean }) => void
  onToggle: (id: string) => void
  onBack: () => void
  onContext: (id: string, x: number, y: number) => void
  onRowAction: (id: string, action: 'delete' | 'archive' | 'flag' | 'unread') => void
  emptyText: string
  accountNames?: Record<string, string>
  /** false for a real mailbox: the footer must not say "sample data" */
  sample?: boolean
  onOpen: (id: string) => void
  actions: { label: string; onClick: () => void; danger?: boolean }[]
  error?: { onRetry: () => void; busy: boolean }
  sync: { state: 'synced' | 'syncing' | 'offline'; last: Date }
  onSync: () => void
}

type Item = { type: 'head'; label: string; key: string } | { type: 'row'; row: Row; key: string }

/** Minimal windowing: only rows near the viewport are in the DOM. */
export function MessageList({ chips, onRemoveChip, allFolders, rows, selectedId, density, smart, smartCounts, showSmart, onToggleSmart, title, subtitle, picked, error, onRowClick, onToggle, onBack, onContext, onRowAction, emptyText, accountNames, sample = true, onOpen, actions, sync, onSync }: Props) {
  const { colours } = useSettings()
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const [nowMs] = useState(() => new Date().getTime())
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
    <section className="list" aria-label="Message list" data-multi={picked.length > 1 ? 'true' : undefined}>
      <header className="list-head">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Back to folders">
          <Icon name="back" />
        </button>
        <h2>
          {title}
          <small>{subtitle}</small>
        </h2>
        {actions.length > 0 && (
          <div className="head-actions">
            {actions.map((a) => (
              <button key={a.label} type="button" className={`link${a.danger ? ' danger' : ''}`} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {(chips.length > 0 || allFolders) && (
        <div className="smart-row filter-row" role="group" aria-label="Search filters">
          {allFolders && <span className="filter-chip static">All folders</span>}
          {chips.map((c) => (
            <span key={c} className="filter-chip">
              {c}
              <button type="button" aria-label={`Remove filter ${c}`} onClick={() => onRemoveChip(c)}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {showSmart && (
        <div className="smart-row" role="group" aria-label="Smart categories">
          {SMART.map((d) => {
            const on = smart.includes(d.id)
            const n = smartCounts[d.id]
            return (
              <button key={d.id} type="button" className={`smart-chip${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${d.label}, ${n} message${n === 1 ? '' : 's'}`} onClick={() => onToggleSmart(d.id)} style={{ ['--dot' as string]: `var(${d.dot})` }}>
                <i aria-hidden="true" />
                {d.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="scroller" id="message-list" ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="list" aria-label="Messages" tabIndex={0}>
        {error ? (
          <div className="empty list-error" role="alert">
            <strong>Couldn't load this folder</strong>
            <span>Your mail is safe. Check your connection and try again.</span>
            <button type="button" className="btn" onClick={error.onRetry} disabled={error.busy}>
              {error.busy ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : rows.length === 0 ? (
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
              const isPicked = picked.includes(msg.id)
              return (
                <div
                  key={it.key}
                  role="listitem"
                  aria-current={sel ? 'true' : undefined}
                  className={`row${sel ? ' sel' : ''}${isPicked ? ' picked' : ''}${unread ? ' unread' : ''}${msg.colour ? ` tint-${msg.colour}` : ''}`}
                  style={{ position: 'absolute', top: y, height: rowH }}
                  onClick={(e) => onRowClick(msg.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                  onDoubleClick={() => onOpen(msg.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-pivot-msg', isPicked && picked.length > 1 ? picked.join(',') : msg.id)
                    e.dataTransfer.setData('text/plain', msg.subject)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContext(msg.id, e.clientX, e.clientY)
                  }}
                >
                  <button
                    type="button"
                    className="rcheck"
                    role="checkbox"
                    aria-checked={isPicked}
                    aria-label={`Select: ${msg.subject}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(msg.id)
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {isPicked && <Icon name="check" size={12} />}
                  </button>
                  <span className={`udot${unread ? ' on' : ''}`} role="img" aria-label={unread ? 'Unread' : ''} aria-hidden={!unread} />
                  <div className="row-main">
                    <div className="row-top">
                      <span className="from">{msg.folder === 'sent' || msg.folder === 'drafts' ? `To: ${msg.to[0]?.name ?? ''}` : msg.from.name}</span>
                      {count > 1 && <span className="thread-count">{count}</span>}
                      <span className="time">{formatListTime(msg.date)}</span>
                    </div>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button data-tone="red" type="button" aria-label={`Delete: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'delete')}>
                        <Icon name="trash" size={15} />
                      </button>
                      <button data-tone="purple" type="button" aria-label={`Archive: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'archive')}>
                        <Icon name="archive" size={15} />
                      </button>
                      <button data-tone="orange" type="button" aria-label={`${msg.flagged ? 'Remove flag' : 'Flag'}: ${msg.subject}`} aria-pressed={msg.flagged} onClick={() => onRowAction(msg.id, 'flag')}>
                        <Icon name="flag" size={15} />
                      </button>
                      <button data-tone="blue" type="button" aria-label={`${unread ? 'Mark as read' : 'Mark as unread'}: ${msg.subject}`} onClick={() => onRowAction(msg.id, 'unread')}>
                        <Icon name="eye" size={15} />
                      </button>
                      <button data-tone="gray"
                        type="button"
                       
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
                      {accountNames && <span className="pill acc">{accountNames[msg.accountId]}</span>}
                      {msg.attachments.length > 0 && (
                        <span className="icon-inline" role="img" aria-label={`${msg.attachments.length} attachment(s)`}>
                          <Icon name="clip" size={14} />
                        </span>
                      )}
                      {msg.important && (
                        <span className="icon-inline" role="img" aria-label="Important">
                          <Icon name="important" size={14} tone="red" />
                        </span>
                      )}
                      {msg.flagged && (
                        <span className="icon-inline" role="img" aria-label="Flagged">
                          <Icon name="flag" size={14} tone="orange" />
                        </span>
                      )}
                      {msg.sendAt && <span className="pill">Sends {fmtWhen(msg.sendAt)}</span>}
                      {msg.snoozedUntil && <span className="pill">Until {fmtWhen(msg.snoozedUntil)}</span>}
                      {msg.dueAt && <span className={`pill${new Date(msg.dueAt).getTime() < nowMs ? ' warn' : ''}`}>Due {fmtWhen(msg.dueAt)}</span>}
                      {msg.colour && (
                        <span className={`dot c-${msg.colour}`} role="img" aria-label={`Category: ${colours.find((c) => c.id === msg.colour)?.label ?? ''}`} />
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
              : `Synced ${sync.last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${sample ? ' · sample data' : ''}`}
        </span>
        <button type="button" className="link" onClick={onSync} disabled={sync.state !== 'synced'}>
          Sync now
        </button>
      </footer>
    </section>
  )
}
