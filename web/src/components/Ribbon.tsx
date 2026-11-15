import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Colour, Density, PaneLayout } from '../types'
import { TEMPLATES } from '../data/templates'
import { COLOURS } from '../data/colours'
import type { Template } from '../data/templates'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Props {
  hasSelection: boolean
  threaded: boolean
  pane: PaneLayout
  density: Density
  notifications: NotificationPermission | 'unsupported'
  onNew: () => void
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onDelete: () => void
  onArchive: () => void
  onToggleUnread: () => void
  onToggleFlag: () => void
  onColour: (c: Colour | undefined) => void
  onTemplate: (t: Template) => void
  onThreaded: (v: boolean) => void
  onPane: (p: PaneLayout) => void
  onDensity: (d: Density) => void
  onEnableNotifications: () => void
}

function Btn(props: { icon: IconName; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean; pressed?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      className={`rb${props.primary ? ' rb-primary' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      title={props.label}
    >
      <Icon name={props.icon} size={20} />
      <span>{props.label}</span>
      {props.children}
    </button>
  )
}

function Menu(props: { icon: IconName; label: string; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="rmenu" ref={ref}>
      <button type="button" className="rb" onClick={() => setOpen((o) => !o)} disabled={props.disabled} aria-haspopup="menu" aria-expanded={open}>
        <Icon name={props.icon} size={20} />
        <span>
          {props.label} <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && (
        <div className="popover" role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function Ribbon(p: Props) {
  const [tab, setTab] = useState<'home' | 'view'>('home')
  const categories = Array.from(new Set(TEMPLATES.map((t) => t.category)))
  const sel = !p.hasSelection

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist">
        {(['home', 'view'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)} type="button">
            {t === 'home' ? 'Home' : 'View'}
          </button>
        ))}
      </div>
      <div className="ribbon-body">
        {tab === 'home' ? (
          <>
            <Btn icon="compose" label="New mail" primary onClick={p.onNew} />
            <span className="sep" />
            <Btn icon="trash" label="Delete" disabled={sel} onClick={p.onDelete} />
            <Btn icon="archive" label="Archive" disabled={sel} onClick={p.onArchive} />
            <span className="sep" />
            <Btn icon="reply" label="Reply" disabled={sel} onClick={p.onReply} />
            <Btn icon="replyAll" label="Reply all" disabled={sel} onClick={p.onReplyAll} />
            <Btn icon="forward" label="Forward" disabled={sel} onClick={p.onForward} />
            <span className="sep" />
            <Btn icon="eye" label="Read / Unread" disabled={sel} onClick={p.onToggleUnread} />
            <Btn icon="flag" label="Flag" disabled={sel} onClick={p.onToggleFlag} />
            <Menu icon="tag" label="Colour" disabled={sel}>
              {(close) => (
                <>
                  {COLOURS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        p.onColour(c.id)
                        close()
                      }}
                    >
                      <span className={`dot c-${c.id}`} /> {c.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      p.onColour(undefined)
                      close()
                    }}
                  >
                    <span className="dot" /> Clear colour
                  </button>
                </>
              )}
            </Menu>
            <span className="sep" />
            <Menu icon="template" label="Templates">
              {(close) => (
                <>
                  {categories.map((cat) => (
                    <div key={cat}>
                      <div className="menu-head">{cat}</div>
                      {TEMPLATES.filter((t) => t.category === cat).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          className="menu-item"
                          onClick={() => {
                            p.onTemplate(t)
                            close()
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </Menu>
          </>
        ) : (
          <>
            <Btn icon="threads" label="Group by conversation" pressed={p.threaded} onClick={() => p.onThreaded(!p.threaded)} />
            <span className="sep" />
            <Menu icon="layout" label="Reading pane">
              {(close) => (
                <>
                  {(['right', 'bottom', 'off'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="menuitemradio"
                      aria-checked={p.pane === v}
                      className="menu-item"
                      onClick={() => {
                        p.onPane(v)
                        close()
                      }}
                    >
                      {p.pane === v ? <Icon name="check" size={14} /> : <span className="ph" />} {v === 'right' ? 'Right' : v === 'bottom' ? 'Bottom' : 'Off'}
                    </button>
                  ))}
                </>
              )}
            </Menu>
            <Menu icon="menu" label="Density">
              {(close) => (
                <>
                  {(['comfortable', 'compact'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="menuitemradio"
                      aria-checked={p.density === v}
                      className="menu-item"
                      onClick={() => {
                        p.onDensity(v)
                        close()
                      }}
                    >
                      {p.density === v ? <Icon name="check" size={14} /> : <span className="ph" />} {v === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </button>
                  ))}
                </>
              )}
            </Menu>
            <span className="sep" />
            <Btn
              icon="bell"
              label={p.notifications === 'granted' ? 'Notifications on' : p.notifications === 'denied' ? 'Notifications blocked' : p.notifications === 'unsupported' ? 'Notifications unavailable' : 'Enable notifications'}
              disabled={p.notifications !== 'default'}
              onClick={p.onEnableNotifications}
            />
          </>
        )}
      </div>
    </div>
  )
}
