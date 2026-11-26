import { refGeneratorOn } from '../features'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Density, PaneLayout } from '../types'
import { initials } from '../util'
import { BrandLogo } from './BrandLogo'
import { Icon } from './Icon'
import { SearchBox } from './SearchBox'
import type { Notice } from './Notices'
import type { Weather } from '../weather'
import type { RefAnchor } from './RefGenerator'
import type { SearchIn } from '../searchScope'

export interface HistoryItem {
  id: number
  kind: Notice['kind']
  text: string
  at: Date
}

interface Props {
  threaded: boolean
  pane: PaneLayout
  density: Density
  notifications: NotificationPermission | 'unsupported'
  query: string
  onQuery: (q: string) => void
  onNew: () => void
  onThreaded: (v: boolean) => void
  onPane: (p: PaneLayout) => void
  onDensity: (d: Density) => void
  onEnableNotifications: () => void
  onRef: (anchor?: RefAnchor) => void
  refOpen: boolean
  onSignOut: () => void
  /** Real sign-in only: end every session of this person (other computers, phones) */
  onSignOutAll?: () => void
  /** Dark theme switch (in the avatar menu) */
  dark: boolean
  onDark: (v: boolean) => void
  /** Email of the signed-in person, when real sign-in is used */
  signedInAs?: string
  /** Full name of the person (the preview uses a placeholder) */
  userName: string
  /** Only administrators may preview the staff view */
  canSwitchRole: boolean
  role: 'admin' | 'staff'
  onRole: (r: 'admin' | 'staff') => void
  onPerformance: () => void
  onSettings: () => void
  onHelp: () => void
  registerSearch: (el: HTMLInputElement | null) => void
  recent: string[]
  saved: string[]
  searchIn: SearchIn
  onSearchIn: (v: SearchIn) => void
  hereLabel: string | null
  onCommit: (q: string) => void
  onSave: (q: string) => void
  onRemoveSaved: (q: string) => void
  history: HistoryItem[]
  unseen: number
  onSeen: () => void
  onClearHistory: () => void
  onToggleFolders: () => void
  foldersOpen: boolean
  weather: Weather | null
  /** Line under the name: role and company */
  subtitle: string
}

const greeting = (d = new Date()): string => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening')

function Menu(props: { label: string; className?: string; trigger: (open: boolean) => ReactNode; onOpen?: () => void; align?: 'left' | 'right'; children: (close: () => void) => ReactNode }) {
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
    const left = props.align === 'right' ? r.right - width : r.left
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) })
    props.onOpen?.()
  }

  return (
    <>
      <button ref={btn} type="button" className={props.className ?? 'cb'} onClick={toggle} aria-label={props.label} aria-haspopup="menu" aria-expanded={open}>
        {props.trigger(open)}
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

const ago = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function Toolbar(p: Props) {
  const first = p.userName.trim().split(/\s+/)[0] || 'there'
  const notifLabel =
    p.notifications === 'granted'
      ? 'Desktop notifications on'
      : p.notifications === 'denied'
        ? 'Notifications blocked in browser'
        : p.notifications === 'unsupported'
          ? 'Notifications unavailable'
          : 'Turn on desktop notifications'

  return (
    <header className="topbar" aria-label="Mail toolbar">
      {/* One row (Minhaj 2026-11-26): the message-action ribbon is gone; every action lives next to the mail (subject row,
          hover buttons, right-click, ⋯) and Templates in the New mail window. Menu button and logo above the folders, then
          New mail, search and the person's own controls. */}
      <div className="tp-brand">
        <button type="button" className="cb-hamburger" onClick={p.onToggleFolders} aria-label={p.foldersOpen ? 'Hide folders' : 'Show folders'} aria-pressed={p.foldersOpen}>
          <Icon name="menu" size={20} />
        </button>
        <h1 className="logo-h1">
          <BrandLogo />
        </h1>
      </div>

      <div className="tp-main">
        <div className="newsplit">
        <button type="button" className="nm-btn" onClick={p.onNew} aria-label="New mail">
          <Icon name="plus" size={16} />
          <span>New mail</span>
        </button>
        <Menu label="More ways to start a message" className="newsplit-more" trigger={() => <Icon name="chevron" size={14} />}>
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  p.onNew()
                  close()
                }}
              >
                <span className="ph" />
                New mail
              </button>
              {refGeneratorOn() && (
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onRef()
                    close()
                  }}
                >
                  <span className="ph" />
                  New mail with a reference number
                </button>
              )}
            </>
          )}
        </Menu>
      </div>
          {refGeneratorOn() && (
        <button
          type="button"
          className="cb tp-ref"
          data-ref-anchor
          aria-haspopup="dialog"
          aria-expanded={p.refOpen}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            p.onRef({ left: r.left, right: r.right, bottom: r.bottom })
          }}
        >
          <Icon name="hash" size={17} tone="teal" />
          <span className="cb-label">Ref No.</span>
        </button>
        )}
        <SearchBox
          query={p.query}
          onQuery={p.onQuery}
          recent={p.recent}
          saved={p.saved}
          searchIn={p.searchIn}
          onSearchIn={p.onSearchIn}
          hereLabel={p.hereLabel}
          onCommit={p.onCommit}
          onSave={p.onSave}
          onRemoveSaved={p.onRemoveSaved}
          registerSearch={p.registerSearch}
        />
        <div className="tp-right">
          <Menu
            label={p.unseen > 0 ? `Notifications, ${p.unseen} new` : 'Notifications'}
            className="tp-icon"
            align="right"
            onOpen={p.onSeen}
            trigger={() => (
              <>
                <Icon name="bell" size={19} />
                {p.unseen > 0 && <span className="tp-dot" aria-hidden="true" />}
              </>
            )}
          >
            {(close) => (
              <>
                <div className="menu-head">Notifications</div>
                {p.history.length === 0 && <div className="menu-note">Nothing yet. Sent mail, saved drafts and sync problems show here.</div>}
                {p.history.map((h) => (
                  <div key={h.id} className="menu-note hist">
                    <span className={`hist-dot ${h.kind}`} aria-hidden="true" />
                    <span className="grow">{h.text}</span>
                    <small>{ago(h.at)}</small>
                  </div>
                ))}
                {p.history.length > 0 && (
                  <>
                    <div className="menu-sep" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        p.onClearHistory()
                        close()
                      }}
                    >
                      <span className="ph" />
                      Clear
                    </button>
                  </>
                )}
              </>
            )}
          </Menu>

          <Menu label="Settings" className="tp-icon" align="right" trigger={() => <Icon name="settings" size={19} />}>
            {(close) => (
              <>
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
                    <Icon name="settings" size={14} />
                  </span>
                  All settings…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    p.onHelp()
                    close()
                  }}
                >
                  <span className="ph" />
                  Keyboard shortcuts
                </button>
                <div className="menu-sep" role="separator" />
                <div className="menu-head">View</div>
                <Check role="menuitemcheckbox" checked={p.threaded} label="Group by conversation" onSelect={() => p.onThreaded(!p.threaded)} />
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
              </>
            )}
          </Menu>

          <Menu
            label={`Account menu for ${p.userName}`}
            className="tp-avatar"
            align="right"
            trigger={() => (
              <>
                {p.weather && (
                  <span className="tp-weather" title="Current weather">
                    <Icon name={p.weather.kind} size={17} />
                    <span>{p.weather.temp}°</span>
                  </span>
                )}
                <span className="tp-who">
                  <span className="tp-greet">
                    <strong>{greeting()},</strong> {first}
                  </span>
                  <span className="tp-sub">{p.subtitle}</span>
                </span>
                <span className="tp-avatar-icon" aria-hidden="true">
                  {p.userName.trim() ? initials(p.userName) : <Icon name="user" size={16} />}
                </span>
                <Icon name="chevron" size={12} />
              </>
            )}
          >
            {(close) => (
              <>
                <div className="menu-note account-head">
                  <strong>
                    {greeting()}, {first}
                  </strong>
                  {p.signedInAs && <small className="block">{p.signedInAs}</small>}
                  <small className="block">{p.role === 'admin' ? 'Administrator' : 'Staff'}</small>
                </div>
                <div className="menu-sep" role="separator" />
                {p.role === 'admin' && (
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
                )}
                {p.canSwitchRole && (
                  <Check
                    role="menuitemcheckbox"
                    checked={p.role === 'staff'}
                    label="Preview as staff"
                    onSelect={() => {
                      p.onRole(p.role === 'staff' ? 'admin' : 'staff')
                      close()
                    }}
                  />
                )}
                <div className="menu-sep" role="separator" />
                <button type="button" role="menuitemcheckbox" aria-checked={p.dark} className="menu-item theme-item" onClick={() => p.onDark(!p.dark)}>
                  <span className="ph">
                    <Icon name={p.dark ? 'moon' : 'sun'} size={14} />
                  </span>
                  Dark mode
                  <span className={`mini-switch${p.dark ? ' on' : ''}`} aria-hidden="true">
                    <span />
                  </span>
                </button>
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
                  {p.signedInAs ? 'Sign out' : 'Sign out (preview)'}
                </button>
                {p.onSignOutAll && (
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      p.onSignOutAll?.()
                      close()
                    }}
                  >
                    <span className="ph" />
                    Sign out of all devices
                  </button>
                )}
              </>
            )}
          </Menu>
        </div>
      </div>

    </header>
  )
}
