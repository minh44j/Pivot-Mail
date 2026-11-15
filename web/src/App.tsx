import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, Colour, ComposeInit, Density, MobileView, Message, PaneLayout, Row } from './types'
import type { Template } from './data/templates'
import { ACCOUNTS, INITIAL_MESSAGES, LABELS } from './data/mock'
import { platform } from './platform'
import { matchesQuery, parseQuery } from './util'
import { Ribbon } from './components/Ribbon'
import { FolderPane } from './components/FolderPane'
import type { FolderSel } from './components/FolderPane'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { Composer } from './components/Composer'
import { Icon } from './components/Icon'

function usePersisted<T extends string | boolean>(key: string, initial: T, valid: (v: string) => boolean): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = platform.storage.get(key)
    if (raw === null || !valid(raw)) return initial
    return (typeof initial === 'boolean' ? raw === 'true' : raw) as T
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      platform.storage.set(key, String(v))
    },
    [key],
  )
  return [value, set]
}

const FOLDER_TITLES: Record<string, string> = { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', deleted: 'Deleted' }

export default function App() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [accountId, setAccountId] = useState('me')
  const [sel, setSel] = useState<FolderSel>({ kind: 'folder', id: 'inbox' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [threaded, setThreaded] = usePersisted<boolean>('pm.threaded', true, (v) => v === 'true' || v === 'false')
  const [pane, setPane] = usePersisted<PaneLayout>('pm.pane', 'right', (v) => ['right', 'bottom', 'off'].includes(v))
  const [density, setDensity] = usePersisted<Density>('pm.density', 'comfortable', (v) => v === 'comfortable' || v === 'compact')
  const [view, setView] = useState<MobileView>('list')
  const [compose, setCompose] = useState<ComposeInit | null>(null)
  const [composeKey, setComposeKey] = useState(0)
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [notif, setNotif] = useState(platform.notificationState())
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  // Optimistic update helper: UI changes instantly; the sync layer will reconcile later.
  const patch = useCallback((ids: string[], change: Partial<Message>) => {
    const set = new Set(ids)
    setMessages((prev) => prev.map((m) => (set.has(m.id) ? { ...m, ...change } : m)))
  }, [])

  const rows = useMemo<Row[]>(() => {
    const parsed = parseQuery(query)
    const inScope = messages.filter((m) => {
      if (m.accountId !== accountId) return false
      if (sel.kind === 'folder' ? m.folder !== sel.id : m.folder !== 'inbox' || !m.labels.includes(sel.id)) return false
      return matchesQuery(m, parsed) && (!unreadOnly || m.unread)
    })
    inScope.sort((a, b) => b.date.localeCompare(a.date))
    if (!threaded) return inScope.map((msg) => ({ msg, count: 1, unread: msg.unread }))
    const byThread = new Map<string, Row>()
    for (const msg of inScope) {
      const row = byThread.get(msg.threadId)
      if (!row) byThread.set(msg.threadId, { msg, count: 1, unread: msg.unread })
      else {
        row.count += 1
        row.unread = row.unread || msg.unread
      }
    }
    return Array.from(byThread.values())
  }, [messages, accountId, sel, query, unreadOnly, threaded])

  const selectedRow = rows.find((r) => r.msg.id === selectedId)
  const thread = useMemo<Message[]>(() => {
    if (!selectedRow) return []
    if (!threaded) return [selectedRow.msg]
    return messages
      .filter((m) => m.threadId === selectedRow.msg.threadId && m.accountId === accountId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedRow, threaded, messages, accountId])

  const totalUnread = useMemo(() => messages.filter((m) => m.unread && m.folder === 'inbox').length, [messages])
  useEffect(() => platform.setBadge(totalUnread), [totalUnread])

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      setView('read')
      const row = rows.find((r) => r.msg.id === id)
      if (row) {
        const ids = messages.filter((m) => m.unread && (threaded ? m.threadId === row.msg.threadId : m.id === id) && m.accountId === accountId).map((m) => m.id)
        if (ids.length > 0) patch(ids, { unread: false })
      }
    },
    [rows, messages, threaded, accountId, patch],
  )

  const openCompose = useCallback(
    (init?: Partial<ComposeInit>) => {
      setComposeKey((k) => k + 1)
      setCompose({ accountId, to: '', cc: '', subject: '', body: '', attachments: [], ...init })
    },
    [accountId],
  )

  const quote = (m: Message): string => `\n\nOn ${new Date(m.date).toLocaleString()}, ${m.from.name} wrote:\n${m.body.split('\n').map((l) => `> ${l}`).join('\n')}`
  const last = thread[thread.length - 1]
  const reply = (all: boolean) => {
    if (!last) return
    const acc = ACCOUNTS.find((a) => a.id === accountId)
    const cc = all ? last.to.map((t) => t.email).filter((e) => e !== acc?.email && e !== last.from.email).join(', ') : ''
    openCompose({ to: last.from.email, cc, subject: /^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`, body: quote(last) })
  }
  const forward = () => {
    if (!last) return
    openCompose({ subject: /^fwd?:/i.test(last.subject) ? last.subject : `Fwd: ${last.subject}`, body: quote(last), attachments: last.attachments })
  }

  const moveSelected = (folder: Message['folder'], label: string) => {
    if (!selectedRow) return
    const idx = rows.findIndex((r) => r.msg.id === selectedRow.msg.id)
    const ids = thread.map((m) => m.id)
    patch(ids, { folder })
    const next = rows[idx + 1] ?? rows[idx - 1]
    setSelectedId(next ? next.msg.id : null)
    if (!next) setView('list')
    showToast(label)
  }

  const colourSelected = (c: Colour | undefined) => {
    if (selectedRow) patch(thread.map((m) => m.id), { colour: c })
  }

  // Keyboard: navigation and Outlook-style shortcuts. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select, [contenteditable="true"]')
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'n' && !compose) {
        e.preventDefault()
        openCompose()
        return
      }
      if (typing || compose) return
      const idx = rows.findIndex((r) => r.msg.id === selectedId)
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = rows[idx + 1] ?? rows[0]
        if (next) select(next.msg.id)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = idx > 0 ? rows[idx - 1] : rows[0]
        if (prev) select(prev.msg.id)
      } else if (e.key === 'Delete' && selectedRow) {
        moveSelected('deleted', 'Moved to Deleted')
      } else if (e.key === 'e' && selectedRow) {
        moveSelected('archive', 'Archived')
      } else if (mod && e.key.toLowerCase() === 'r' && last) {
        e.preventDefault()
        reply(e.shiftKey)
      } else if (e.key === 'Insert' && selectedRow) {
        patch(thread.map((m) => m.id), { flagged: !selectedRow.msg.flagged })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = sel.kind === 'folder' ? (FOLDER_TITLES[sel.id] ?? sel.id) : sel.id
  const hasSel = Boolean(selectedRow)
  const showReader = pane !== 'off'

  return (
    <div className="app" data-density={density}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            P
          </span>
          <span className="brand-name">Pivot Mail</span>
        </div>
        <label className="search topsearch">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail  (try from: or has:attachment)"
            aria-label="Search mail"
          />
        </label>
        <span className="muted env">Preview · mock data</span>
      </header>
      <Ribbon
        hasSelection={hasSel}
        threaded={threaded}
        pane={pane}
        density={density}
        notifications={notif}
        onNew={() => openCompose()}
        onReply={() => reply(false)}
        onReplyAll={() => reply(true)}
        onForward={forward}
        onDelete={() => moveSelected('deleted', 'Moved to Deleted')}
        onArchive={() => moveSelected('archive', 'Archived')}
        onToggleUnread={() => selectedRow && patch(thread.map((m) => m.id), { unread: !selectedRow.msg.unread })}
        onToggleFlag={() => selectedRow && patch(thread.map((m) => m.id), { flagged: !selectedRow.msg.flagged })}
        onColour={colourSelected}
        onTemplate={(t) => {
          if (!compose) openCompose()
          setPendingTemplate(t)
        }}
        onThreaded={setThreaded}
        onPane={setPane}
        onDensity={setDensity}
        onEnableNotifications={() => void platform.requestNotifications().then(setNotif)}
      />
      <main className="workspace" data-pane={pane} data-view={view}>
        <FolderPane
          accounts={ACCOUNTS}
          messages={messages}
          activeAccountId={accountId}
          selection={sel}
          labels={LABELS}
          onAccount={(id) => {
            setAccountId(id)
            setSel({ kind: 'folder', id: 'inbox' })
            setSelectedId(null)
          }}
          onSelect={(s) => {
            setSel(s)
            setSelectedId(null)
            setView('list')
          }}
        />
        <MessageList
          rows={rows}
          selectedId={selectedId}
          density={density}
          unreadOnly={unreadOnly}
          title={title}
          onUnreadOnly={setUnreadOnly}
          onSelect={select}
          onBack={() => setView('folders')}
        />
        {showReader && (
          <ReadingPane
            messages={thread}
            onReply={() => reply(false)}
            onReplyAll={() => reply(true)}
            onForward={forward}
            onBack={() => setView('list')}
            onToast={showToast}
            onForwardWith={(files: Attachment[]) => openCompose({ attachments: files })}
          />
        )}
      </main>
      {compose && (
        <Composer
          key={composeKey}
          init={compose}
          accounts={ACCOUNTS}
          pendingTemplate={pendingTemplate}
          onTemplateUsed={() => setPendingTemplate(null)}
          onSend={() => {
            setCompose(null)
            showToast('Message sent (mock)')
          }}
          onClose={() => setCompose(null)}
          onToast={showToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
