import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Colour, Density, PaneLayout } from '../types'
import type { Template } from '../data/templates'
import { useSettings } from '../settings'
import logoLockup from '../assets/brand/logo-lockup.png'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Props {
  hasSelection: boolean
  threaded: boolean
  pane: PaneLayout
  density: Density
  notifications: NotificationPermission | 'unsupported'
  query: string
  onQuery: (q: string) => void
  onNew: () => void
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onArchive: () => void
  onColour: (c: Colour | undefined) => void
  onTemplate: (t: Template) => void
  onThreaded: (v: boolean) => void
  onPane: (p: PaneLayout) => void
  onDensity: (d: Density) => void
  onEnableNotifications: () => void
  onRef: () => void
  onSignOut: () => void
  role: 'admin' | 'staff'
  onRole: (r: 'admin' | 'staff') => void
  onPerformance: () => void
  onSettings: () => void
}

/** Icon-only toolbar item. Label is exposed as tooltip and accessible name. */
function Item(props: { icon: IconName; label: string; title?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="tb" onClick={props.onClick} disabled={props.disabled} title={props.title ?? props.label}>
      <Icon name={props.icon} size={18} />
      <span className="tb-label">{props.label}</span>
    </button>
  )
}

function Menu(props: { icon: IconName; label: string; title?: string; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) return setPos(null)
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const width = 264
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) })
  }

  return (
    <>
      <button ref={btn} type="button" className="tb tb-menu" onClick={toggle} disabled={props.disabled} title={props.title ?? props.label} aria-haspopup="menu" aria-expanded={open}>
        <span className="tb-icons">
          <Icon name={props.icon} size={18} />
          <Icon name="chevron" size={10} />
        </span>
        <span className="tb-label">{props.label}</span>
      </button>
      {pos && (
        <div ref={pop} className="popover" role="menu" style={{ top: pos.top, left: pos.left }}>
          {props.children(() => setPos(null))}
        </div>
      )}
    </>
  )
}

function Check(props: { checked: boolean; label: string; role: 'menuitemcheckbox' | 'menuitemradio'; onSelect: () => void }) {
  return (
    <button type="button" role={props.role} aria-checked={props.checked} className="menu-item" onClick={props.onSelect}>
      <span className="ph">{props.checked && <Icon name="check" size={14} />}</span>
      {props.label}
    </button>
  )
}

export function Toolbar(p: Props) {
  const { templates, colours } = useSettings()
  const categories = Array.from(new Set(templates.map((t) => t.category)))
  const none = !p.hasSelection
  const notifLabel =
    p.notifications === 'granted'
      ? 'Notifications on'
      : p.notifications === 'denied'
        ? 'Notifications blocked in browser'
        : p.notifications === 'unsupported'
          ? 'Notifications unavailable'
          : 'Turn on notifications'

  return (
    <header className="toolbar" role="toolbar" aria-label="Mail toolbar">
      <img className="logo-bar" src={logoLockup} alt="Pivot Mail" />

      <div className="tb-scroll">
        <div className="tb-group" role="group" aria-label="Archive">
          <Item icon="archive" label="Archive" disabled={none} onClick={p.onArchive} />
        </div>
        <div className="tb-group" role="group" aria-label="Respond">
          <Item icon="reply" label="Reply" disabled={none} onClick={p.onReply} />
          <Item icon="replyAll" label="Reply all" disabled={none} onClick={p.onReplyAll} />
          <Item icon="forward" label="Forward" disabled={none} onClick={p.onForward} />
        </div>
        <div className="tb-group" role="group" aria-label="Tag">
          <Menu icon="tag" label="Colour" title="Colour category" disabled={none}>
            {(close) => (
              <>
                {colours.map((c) => (
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
                    <span className="ph">
                      <span className={`dot c-${c.id}`} />
                    </span>
                    {c.label}
                  </button>
                ))}
                <div className="menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onColour(undefined)
                    close()
                  }}
                >
                  <span className="ph" />
                  Clear category
                </button>
              </>
            )}
          </Menu>
        </div>

        <div className="tb-group tb-extra" role="group" aria-label="More">
          <Item icon="hash" label="Ref no." title="Generate a reference number" onClick={p.onRef} />
          <Menu icon="template" label="Templates">
            {(close) => (
              <>
                {categories.map((cat, i) => (
                  <div key={cat}>
                    {i > 0 && <div className="menu-sep" role="separator" />}
                    <div className="menu-head">{cat}</div>
                    {templates.filter((t) => t.category === cat).map((t) => (
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
                        <span className="ph" />
                        {t.name}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </Menu>
          <Menu icon="menu" label="View" title="View options">
            {(close) => (
              <>
                <Check role="menuitemcheckbox" checked={p.threaded} label="Group by conversation" onSelect={() => p.onThreaded(!p.threaded)} />
                <div className="menu-sep" role="separator" />
                <div className="menu-head">Reading pane</div>
                {(['right', 'bottom', 'off'] as const).map((v) => (
                  <Check
                    key={v}
                    role="menuitemradio"
                    checked={p.pane === v}
                    label={v === 'right' ? 'Right' : v === 'bottom' ? 'Bottom' : 'Hidden'}
                    onSelect={() => {
                      p.onPane(v)
                      close()
                    }}
                  />
                ))}
                <div className="menu-sep" role="separator" />
                <div className="menu-head">List density</div>
                {(['comfortable', 'compact'] as const).map((v) => (
                  <Check
                    key={v}
                    role="menuitemradio"
                    checked={p.density === v}
                    label={v === 'comfortable' ? 'Comfortable' : 'Compact'}
                    onSelect={() => {
                      p.onDensity(v)
                      close()
                    }}
                  />
                ))}
                <div className="menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={p.notifications !== 'default'}
                  onClick={() => {
                    p.onEnableNotifications()
                    close()
                  }}
                >
                  <span className="ph">
                    <Icon name="bell" size={14} />
                  </span>
                  {notifLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onPerformance()
                    close()
                  }}
                >
                  <span className="ph">
                    <Icon name="layout" size={14} />
                  </span>
                  Staff performance (admin)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onSettings()
                    close()
                  }}
                >
                  <span className="ph">
                    <Icon name="menu" size={14} />
                  </span>
                  Settings…
                </button>
                <Check
                  role="menuitemcheckbox"
                  checked={p.role === 'staff'}
                  label="Preview as staff"
                  onSelect={() => {
                    p.onRole(p.role === 'staff' ? 'admin' : 'staff')
                    close()
                  }}
                />
                <div className="menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onSignOut()
                    close()
                  }}
                >
                  <span className="ph" />
                  Sign out (preview)
                </button>
              </>
            )}
          </Menu>
        </div>
      </div>

      <button type="button" className="tb-new" onClick={p.onNew} title="New mail (Ctrl+N)" aria-label="New mail">
        <Icon name="compose" size={16} />
        <span>New mail</span>
      </button>

      <label className="tb-search">
        <Icon name="search" size={15} />
        <input type="search" value={p.query} onChange={(e) => p.onQuery(e.target.value)} placeholder="Search" aria-label="Search mail. Try from:, to:, subject:, has:attachment, is:unread" />
      </label>
    </header>
  )
}
