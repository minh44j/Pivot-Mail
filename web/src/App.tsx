import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Attachment, Colour, ComposeInit, Density, MobileView, Message, PaneLayout, Row } from './types'
import { TEMPLATES } from './data/templates'
import type { Template } from './data/templates'
import { ACCOUNTS, INITIAL_MESSAGES, LABELS } from './data/mock'
import { platform } from './platform'
import { matchesQuery, parseQuery } from './util'
import { escapeHtml, textToHtml } from './richtext'
import { Toolbar } from './components/Toolbar'
import { FolderPane } from './components/FolderPane'
import type { FolderSel } from './components/FolderPane'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { Composer } from './components/Composer'
import { ContextMenu } from './components/ContextMenu'
import type { MenuEntry } from './components/ContextMenu'
import { RefGenerator } from './components/RefGenerator'
import { SignIn } from './components/SignIn'
import { PerformancePage } from './components/PerformancePage'
import { SettingsPage } from './components/SettingsPage'
import { SettingsContext, mergeColours } from './settings'

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

function useStored<T>(key: string, initial: T, valid: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = platform.storage.get(key)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (valid(parsed)) return parsed
      }
    } catch {
      /* fall through to the default */
    }
    return initial
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      platform.storage.set(key, JSON.stringify(v))
    },
    [key],
  )
  return [value, set]
}

const isRecord = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')
const isTemplates = (v: unknown): v is Template[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'object' && t !== null && typeof (t as Template).id === 'string' && typeof (t as Template).name === 'string' && typeof (t as Template).body === 'string' && typeof (t as Template).category === 'string')

const FOLDER_TITLES: Record<string, string> = { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', deleted: 'Deleted Items' }

export default function App() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [sel, setSel] = useState<FolderSel>({ accountId: 'me', kind: 'folder', id: 'inbox' })
  const accountId = sel.accountId
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
  const [entered, setEntered] = usePersisted<boolean>('pm.entered', false, (v) => v === 'true' || v === 'false')
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [refOpen, setRefOpen] = useState(false)
  const [screen, setScreen] = useState<'mail' | 'performance' | 'settings'>('mail')
  const [signatures, setSignatures] = useStored<Record<string, string>>('pm.signatures', {}, isRecord)
  const [customTemplates, setCustomTemplates] = useStored<Template[]>('pm.templates', [], isTemplates)
  const [colourNames, setColourNames] = useStored<Record<string, string>>('pm.colours', {}, isRecord)
  const [role, setRole] = usePersisted<'admin' | 'staff'>('pm.role', 'admin', (v) => v === 'admin' || v === 'staff')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(() => new Date())

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

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

  const accounts = useMemo<Account[]>(() => ACCOUNTS.map((a) => ({ ...a, signature: signatures[a.id] ?? a.signature })), [signatures])
  const settingsValue = useMemo(
    () => ({
      templates: [...TEMPLATES.map((t): Template => ({ ...t, scope: 'builtin' })), ...customTemplates],
      colours: mergeColours(colourNames as Partial<Record<Colour, string>>),
    }),
    [customTemplates, colourNames],
  )

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
      setCompose({ accountId, to: '', cc: '', bcc: '', subject: '', body: '', attachments: [], ...init })
    },
    [accountId],
  )

  const quote = (m: Message): string => `<br><br><blockquote>On ${escapeHtml(new Date(m.date).toLocaleString())}, ${escapeHtml(m.from.name)} wrote:<br>${textToHtml(m.body)}</blockquote>`
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

  const syncNow = () => {
    if (!online || syncing) return
    setSyncing(true)
    window.setTimeout(() => {
      setSyncing(false)
      setLastSync(new Date())
    }, 900)
  }

  const idsOf = (m: Message): string[] => messages.filter((x) => x.accountId === m.accountId && (threaded ? x.threadId === m.threadId : x.id === m.id)).map((x) => x.id)

  /** Drag a message (or its conversation) onto a sidebar folder or label. Same mailbox only. */
  const dropMessage = (id: string, target: FolderSel) => {
    const m = messages.find((x) => x.id === id)
    if (!m) return
    if (m.accountId !== target.accountId) {
      showToast("Mail can't be moved between mailboxes")
      return
    }
    const ids = idsOf(m)
    if (target.kind === 'folder') {
      if (m.folder === target.id) return
      patch(ids, { folder: target.id })
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      showToast(`Moved to ${FOLDER_TITLES[target.id] ?? target.id}`)
    } else {
      const set = new Set(ids)
      setMessages((prev) => prev.map((x) => (set.has(x.id) && !x.labels.includes(target.id) ? { ...x, labels: [...x.labels, target.id] } : x)))
      showToast(`Added to ${target.id}`)
    }
  }

  /** Hover buttons on a message row: act on that conversation without selecting it. */
  const rowAction = (id: string, action: 'delete' | 'archive' | 'flag' | 'unread') => {
    const m = messages.find((x) => x.id === id)
    if (!m) return
    const ids = idsOf(m)
    if (action === 'delete') {
      patch(ids, { folder: 'deleted' })
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      showToast('Moved to Deleted Items')
    } else if (action === 'archive') {
      patch(ids, { folder: 'archive' })
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      showToast('Archived')
    } else if (action === 'flag') {
      patch(ids, { flagged: !m.flagged })
    } else {
      const anyUnread = messages.some((x) => ids.includes(x.id) && x.unread)
      patch(ids, { unread: !anyUnread })
    }
  }

  const ctxEntries = (): MenuEntry[] => {
    if (!ctx) return []
    const row = rows.find((r) => r.msg.id === ctx.id)
    if (!row) return []
    const m = row.msg
    const ids = idsOf(m)
    const moveTo = (folder: Message['folder']) => () => {
      patch(ids, { folder })
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      showToast(`Moved to ${FOLDER_TITLES[folder] ?? folder}`)
    }
    const targets = (['inbox', 'archive', 'deleted'] as const).filter((f) => f !== m.folder)
    return [
      { type: 'item', label: 'Reply', icon: 'reply', tone: 'blue', onSelect: () => reply(false) },
      { type: 'item', label: 'Reply all', icon: 'replyAll', tone: 'blue', onSelect: () => reply(true) },
      { type: 'item', label: 'Forward', icon: 'forward', tone: 'blue', onSelect: forward },
      { type: 'sep' },
      { type: 'item', label: m.unread ? 'Mark as read' : 'Mark as unread', icon: 'eye', tone: 'blue', onSelect: () => patch(ids, { unread: !m.unread }) },
      { type: 'item', label: m.flagged ? 'Remove flag' : 'Flag', icon: 'flag', tone: 'orange', onSelect: () => patch(ids, { flagged: !m.flagged }) },
      { type: 'head', label: 'Colour category' },
      { type: 'swatches', current: m.colour, onPick: (c) => patch(ids, { colour: c }) },
      { type: 'sep' },
      { type: 'head', label: 'Move to' },
      ...targets.map((f): MenuEntry => ({ type: 'item', label: FOLDER_TITLES[f] ?? f, icon: f === 'inbox' ? 'inbox' : f === 'archive' ? 'archive' : 'trash', tone: f === 'inbox' ? 'blue' : f === 'archive' ? 'purple' : 'red', onSelect: moveTo(f), danger: f === 'deleted' })),
    ]
  }

  // Keyboard: navigation and Outlook-style shortcuts. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select, [contenteditable="true"]')
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === ',') {
        e.preventDefault()
        setScreen('settings')
        return
      }
      if (mod && e.key.toLowerCase() === 'n' && !compose && !refOpen) {
        e.preventDefault()
        openCompose()
        return
      }
      if (typing || compose || refOpen || ctx) return
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
  const showReader = pane !== 'off'

  if (!entered) return <SignIn onPreview={() => setEntered(true)} />

  if (screen === 'settings') {
    return (
      <SettingsContext.Provider value={settingsValue}>
        <SettingsPage
          role={role}
          accounts={accounts}
          onSignature={(id, text) => setSignatures({ ...signatures, [id]: text })}
          templates={settingsValue.templates}
          onSaveTemplate={(t) => setCustomTemplates(customTemplates.some((x) => x.id === t.id) ? customTemplates.map((x) => (x.id === t.id ? t : x)) : [...customTemplates, t])}
          onDeleteTemplate={(id) => setCustomTemplates(customTemplates.filter((x) => x.id !== id))}
          colourNames={colourNames as Partial<Record<Colour, string>>}
          onColourName={(c, name) => setColourNames({ ...colourNames, [c]: name })}
          onResetColours={() => setColourNames({})}
          threaded={threaded}
          onThreaded={setThreaded}
          pane={pane}
          onPane={setPane}
          density={density}
          onDensity={setDensity}
          notifications={notif}
          onEnableNotifications={() => void platform.requestNotifications().then(setNotif)}
          onBack={() => setScreen('mail')}
          onToast={showToast}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </SettingsContext.Provider>
    )
  }

  if (screen === 'performance') {
    return (
      <>
        <PerformancePage role={role} onBack={() => setScreen('mail')} onToast={showToast} />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    )
  }

  const emptyText = query.trim() ? `No results for “${query.trim()}”` : unreadOnly ? 'No unread messages' : 'Nothing in this folder'

  return (
    <SettingsContext.Provider value={settingsValue}>
    <div className="app" data-density={density}>
      <Toolbar
        query={query}
        onQuery={setQuery}
        threaded={threaded}
        pane={pane}
        density={density}
        notifications={notif}
        onNew={() => openCompose()}
        onTemplate={(t) => {
          if (!compose) openCompose()
          setPendingTemplate(t)
        }}
        onThreaded={setThreaded}
        onPane={setPane}
        onDensity={setDensity}
        onEnableNotifications={() => void platform.requestNotifications().then(setNotif)}
        onRef={() => setRefOpen(true)}
        onSignOut={() => setEntered(false)}
        role={role}
        onRole={setRole}
        onPerformance={() => setScreen('performance')}
        onSettings={() => setScreen('settings')}
      />
      <main className="workspace" data-pane={pane} data-view={view}>
        <FolderPane
          accounts={ACCOUNTS}
          messages={messages}
          selection={sel}
          labels={LABELS}
          onSelect={(s) => {
            setSel(s)
            setSelectedId(null)
            setView('list')
          }}
          onDropMessage={dropMessage}
        />
        <MessageList
          rows={rows}
          selectedId={selectedId}
          density={density}
          unreadOnly={unreadOnly}
          title={title}
          subtitle={ACCOUNTS.find((a) => a.id === accountId)?.email ?? ''}
          onUnreadOnly={setUnreadOnly}
          onSelect={select}
          onBack={() => setView('folders')}
          onContext={(id, x, y) => {
            select(id)
            setCtx({ id, x, y })
          }}
          onRowAction={rowAction}
          emptyText={emptyText}
          sync={{ state: !online ? 'offline' : syncing ? 'syncing' : 'synced', last: lastSync }}
          onSync={syncNow}
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
            onDelete={() => selectedRow && rowAction(selectedRow.msg.id, 'delete')}
            onFlag={() => selectedRow && rowAction(selectedRow.msg.id, 'flag')}
            onUnread={() => selectedRow && rowAction(selectedRow.msg.id, 'unread')}
            flagged={Boolean(selectedRow?.msg.flagged)}
            unread={Boolean(selectedRow?.unread)}
          />
        )}
      </main>
      {compose && (
        <Composer
          key={composeKey}
          init={compose}
          accounts={accounts}
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
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} entries={ctxEntries()} onClose={() => setCtx(null)} />}
      {refOpen && <RefGenerator onClose={() => setRefOpen(false)} onToast={showToast} onNewMail={(subject) => openCompose({ subject })} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
    </SettingsContext.Provider>
  )
}
