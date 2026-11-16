import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Attachment, Colour, ComposeInit, Density, FolderId, MobileView, Message, PaneLayout, Person, Row } from './types'
import { TEMPLATES } from './data/templates'
import type { Template } from './data/templates'
import { ACCOUNTS, INITIAL_MESSAGES, LABELS } from './data/mock'
import { StatusBanner, StatusScreen } from './components/StatusBanner'
import type { Problem } from './problems'
import { AccountDialog } from './components/AccountDialog'
import type { AccountDialogState, NewAccount } from './components/AccountDialog'
import { COMPANIES } from './data/companies'
import { FolderDialog } from './components/FolderDialog'
import type { FolderDialogState } from './components/FolderDialog'
import { platform } from './platform'
import { matchesQuery, parseQuery } from './util'
import { escapeHtml, htmlToPlain, textToHtml } from './richtext'
import { bareAddress, displayName } from './data/contacts'
import { OriginalDialog } from './components/OriginalDialog'
import { buildMessageDoc } from './printdoc'
import { ConfirmDialog } from './components/ConfirmDialog'
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
import { MOD } from './shortcuts'
import { rememberCopiedEmail } from './emailClipboard'
import { SMART, smartMatches } from './smart'
import type { SmartKey } from './smart'
import { FolderJump } from './components/FolderJump'
import { ShortcutHelp } from './components/ShortcutHelp'
import { BulkPanel } from './components/BulkPanel'

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

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const isFolderMap = (v: unknown): v is Record<string, string[]> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isStrings)
const isAccounts = (v: unknown): v is Account[] => Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null && typeof (x as Account).id === 'string' && typeof (x as Account).email === 'string')
const isRecord = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')
const isTemplates = (v: unknown): v is Template[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'object' && t !== null && typeof (t as Template).id === 'string' && typeof (t as Template).name === 'string' && typeof (t as Template).body === 'string' && typeof (t as Template).category === 'string')

const FOLDER_TITLES: Record<string, string> = { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', deleted: 'Deleted Items' }

export default function App() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [sel, setSel] = useState<FolderSel>({ accountId: 'me', kind: 'folder', id: 'inbox' })
  const accountId = sel.accountId
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Conversations selected together (Ctrl/Shift click, checkboxes, Ctrl+A). Empty when only one is open. */
  const [picked, setPicked] = useState<string[]>([])
  const anchorId = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchAll, setSearchAll] = usePersisted<boolean>('pm.searchall', false, (v) => v === 'true' || v === 'false')
  const [recent, setRecent] = useStored<string[]>('pm.recent', [], isStrings)
  const [saved, setSaved] = useStored<string[]>('pm.saved', [], isStrings)
  const [smart, setSmart] = useState<SmartKey[]>([])
  const [showSmart, setShowSmart] = usePersisted<boolean>('pm.smart', true, (v) => v === 'true' || v === 'false')
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
  const [help, setHelp] = useState(false)
  const [jump, setJump] = useState<null | 'go' | 'move'>(null)
  const searchEl = useRef<HTMLInputElement | null>(null)
  const setSearchEl = useCallback((el: HTMLInputElement | null) => {
    searchEl.current = el
  }, [])
  const messagesRef = useRef<Message[]>(INITIAL_MESSAGES)
  const undoStack = useRef<Message[][]>([])
  const [screen, setScreen] = useState<'mail' | 'performance' | 'settings'>('mail')
  const [signatures, setSignatures] = useStored<Record<string, string>>('pm.signatures', {}, isRecord)
  const [customTemplates, setCustomTemplates] = useStored<Template[]>('pm.templates', [], isTemplates)
  const [colourNames, setColourNames] = useStored<Record<string, string>>('pm.colours', {}, isRecord)
  const [role, setRole] = usePersisted<'admin' | 'staff'>('pm.role', 'admin', (v) => v === 'admin' || v === 'staff')
  const [netOnline, setOnline] = useState(() => navigator.onLine)
  const [sim, setSim] = useState<Problem | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [wait, setWait] = useState(30)
  const online = netOnline && sim !== 'offline'
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

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Optimistic update helper: UI changes instantly; the sync layer will reconcile later.
  // Each tracked change keeps a snapshot so Ctrl+Z can undo it.
  const patch = useCallback((ids: string[], change: Partial<Message>, track = true) => {
    const set = new Set(ids)
    if (track) {
      const before = messagesRef.current.filter((m) => set.has(m.id))
      if (before.length > 0) {
        undoStack.current.push(before)
        if (undoStack.current.length > 30) undoStack.current.shift()
      }
    }
    setMessages((prev) => prev.map((m) => (set.has(m.id) ? { ...m, ...change } : m)))
  }, [])

  const pushUndo = useCallback((group: Message[]) => {
    undoStack.current.push(group)
  }, [])

  const undo = () => {
    const snap = undoStack.current.pop()
    if (!snap) {
      showToast('Nothing to undo')
      return
    }
    const byId = new Map(snap.map((m) => [m.id, m]))
    setMessages((prev) => prev.map((m) => byId.get(m.id) ?? m))
    showToast('Undone')
  }

  const [addedAccounts, setAddedAccounts] = useStored<Account[]>('pm.accounts.added', [], isAccounts)
  const [removedIds, setRemovedIds] = useStored<string[]>('pm.accounts.removed', [], isStrings)
  const accountList = useMemo<Account[]>(() => [...ACCOUNTS.filter((a) => !removedIds.includes(a.id)), ...addedAccounts], [addedAccounts, removedIds])
  const accounts = useMemo<Account[]>(() => accountList.map((a) => ({ ...a, signature: signatures[a.id] ?? a.signature })), [accountList, signatures])
  const [accDlg, setAccDlg] = useState<AccountDialogState | null>(null)
  const addAccount = (n: NewAccount) => {
    const local = n.email.split('@')[0] ?? n.email
    const name = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const co = COMPANIES.find((c) => c.id === n.company)
    const acc: Account = { id: `acc-${Date.now()}`, name, email: n.email, shared: n.shared, signature: `${name}\n${co?.name ?? ''}` }
    setAddedAccounts([...addedAccounts, acc])
    setAccDlg(null)
    setSel({ accountId: acc.id, kind: 'folder', id: 'inbox' })
    setSelectedId(null)
    showToast(`${n.email} added (preview, empty mailbox)`)
  }
  const removeAccount = (id: string) => {
    if (accountList.length <= 1) {
      setAccDlg(null)
      showToast('Keep at least one account')
      return
    }
    if (addedAccounts.some((x) => x.id === id)) setAddedAccounts(addedAccounts.filter((x) => x.id !== id))
    else setRemovedIds([...removedIds, id])
    setMessages((prev) => prev.filter((m) => m.accountId !== id))
    if (sel.accountId === id) {
      const first = accountList.find((x) => x.id !== id)
      if (first) setSel({ accountId: first.id, kind: 'folder', id: 'inbox' })
      setSelectedId(null)
    }
    setAccDlg(null)
    showToast('Account removed from this device')
  }
  const settingsValue = useMemo(
    () => ({
      templates: [...TEMPLATES.map((t): Template => ({ ...t, scope: 'builtin' })), ...customTemplates],
      colours: mergeColours(colourNames as Partial<Record<Colour, string>>),
    }),
    [customTemplates, colourNames],
  )

  const commitSearch = useCallback(
    (q: string) => setRecent([q, ...recent.filter((x) => x !== q)].slice(0, 8)),
    [setRecent, recent],
  )
  const queryChips = useMemo(() => query.split(/\s+/).filter((t) => /^(from|to|subject|label|has|is):\S+/i.test(t)), [query])
  const removeChip = (tok: string) => setQuery(query.split(/\s+/).filter((t) => t && t !== tok).join(' '))

  const [folders, setFolders] = useStored<Record<string, string[]>>('pm.folders', Object.fromEntries(ACCOUNTS.map((x) => [x.id, [...LABELS]])), isFolderMap)
  /** Cases are found by the reference number in the subject, newest activity first. */
  const cases = useMemo(() => {
    const out: Record<string, Map<string, string>> = {}
    for (const m of messages) {
      if (m.folder === 'deleted') continue
      for (const ref of m.subject.match(/\bP[ST]\d{7}\b/g) ?? []) {
        const map = (out[m.accountId] ??= new Map<string, string>())
        if ((map.get(ref) ?? '') < m.date) map.set(ref, m.date)
      }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([r]) => r)])) as Record<string, string[]>
  }, [messages])
  const [folderDlg, setFolderDlg] = useState<FolderDialogState | null>(null)
  const folderAction = (accountId: string, action: 'new' | 'rename' | 'delete', name?: string) =>
    setFolderDlg(action === 'new' ? { mode: 'new', accountId } : { mode: action, accountId, name: name ?? '' })
  const reorderFolder = (accountId: string, name: string, before: string | null) => {
    const list = (folders[accountId] ?? []).filter((x) => x !== name)
    const at = before === null ? list.length : list.indexOf(before)
    list.splice(at < 0 ? list.length : at, 0, name)
    setFolders({ ...folders, [accountId]: list })
  }
  const submitFolder = (value: string) => {
    const dlg = folderDlg
    if (!dlg) return
    const list = folders[dlg.accountId] ?? []
    if (dlg.mode === 'new') {
      setFolders({ ...folders, [dlg.accountId]: [...list, value] })
      showToast(`Folder “${value}” created`)
    } else if (dlg.mode === 'rename') {
      if (value !== dlg.name) {
        setFolders({ ...folders, [dlg.accountId]: list.map((x) => (x === dlg.name ? value : x)) })
        setMessages((prev) => prev.map((m) => (m.accountId === dlg.accountId && m.labels.includes(dlg.name) ? { ...m, labels: m.labels.map((l) => (l === dlg.name ? value : l)) } : m)))
        if (sel.kind === 'label' && sel.accountId === dlg.accountId && sel.id === dlg.name) setSel({ ...sel, id: value })
        showToast(`Renamed to “${value}”`)
      }
    } else {
      setFolders({ ...folders, [dlg.accountId]: list.filter((x) => x !== dlg.name) })
      setMessages((prev) => prev.map((m) => (m.accountId === dlg.accountId && m.labels.includes(dlg.name) ? { ...m, labels: m.labels.filter((l) => l !== dlg.name) } : m)))
      if (sel.kind === 'label' && sel.accountId === dlg.accountId && sel.id === dlg.name) {
        setSel({ accountId: dlg.accountId, kind: 'folder', id: 'inbox' })
        setSelectedId(null)
      }
      showToast(`Folder “${dlg.name}” deleted. No mail was deleted.`)
    }
    setFolderDlg(null)
  }

  const [now] = useState(() => new Date())
  /** Messages of the open folder or label, before search and smart filters. */
  const scope = useMemo(
    () =>
      messages.filter((m) => {
        if (m.accountId !== accountId) return false
        if (searchAll && query.trim() !== '') return m.folder !== 'deleted'
        if (sel.kind === 'case') return m.folder !== 'deleted' && m.subject.includes(sel.id)
        return sel.kind === 'folder' ? m.folder === sel.id : m.folder === 'inbox' && m.labels.includes(sel.id)
      }),
    [messages, accountId, sel, searchAll, query],
  )
  const smartCounts = useMemo(() => Object.fromEntries(SMART.map((d) => [d.id, scope.filter((m) => d.test(m, now)).length])) as Record<SmartKey, number>, [scope, now])
  const toggleSmart = (k: SmartKey) => setSmart((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  const rows = useMemo<Row[]>(() => {
    const parsed = parseQuery(query)
    const active = new Set(smart)
    const inScope = scope.filter((m) => matchesQuery(m, parsed) && smartMatches(m, active, now))
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
  }, [scope, query, smart, now, threaded])

  const selectedRow = rows.find((r) => r.msg.id === selectedId)
  const pickedRows = useMemo(() => picked.filter((id) => rows.some((r) => r.msg.id === id)), [picked, rows])
  const multi = pickedRows.length > 1
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
      setPicked([])
      anchorId.current = id
      setView('read')
      const row = rows.find((r) => r.msg.id === id)
      if (row) {
        const ids = messages.filter((m) => m.unread && (threaded ? m.threadId === row.msg.threadId : m.id === id) && m.accountId === accountId).map((m) => m.id)
        if (ids.length > 0) patch(ids, { unread: false }, false)
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

  const parseAddrs = (s: string): Person[] =>
    s
      .split(/[;,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ name: displayName(bareAddress(t)), email: bareAddress(t) }))

  /** A message record from what was typed in the composer. */
  const fromCompose = (d: ComposeInit, id: string, folder: FolderId, extra: Partial<Message> = {}): Message => {
    const acc = accountList.find((x) => x.id === d.accountId) ?? (accountList[0] as Account)
    return {
      id,
      threadId: id,
      accountId: acc.id,
      folder,
      labels: [],
      from: { name: acc.name, email: acc.email },
      to: parseAddrs(d.to),
      cc: parseAddrs(d.cc),
      subject: d.subject.trim() || '(no subject)',
      body: htmlToPlain(d.body),
      html: d.body,
      date: new Date().toISOString(),
      unread: false,
      flagged: false,
      attachments: d.attachments,
      ...extra,
    }
  }
  const upsert = (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [m, ...prev]))

  /** Reopen a draft in the composer. */
  const openDraft = (m: Message) =>
    openCompose({
      accountId: m.accountId,
      to: m.to.map((p) => `${p.name} <${p.email}>`).join(', '),
      cc: (m.cc ?? []).map((p) => `${p.name} <${p.email}>`).join(', '),
      subject: m.subject === '(no subject)' ? '' : m.subject,
      body: m.html ?? textToHtml(m.body),
      attachments: m.attachments,
      draftId: m.id,
    })

  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [original, setOriginal] = useState<Message | null>(null)
  const threadOf = (m: Message): Message[] =>
    (threaded ? messages.filter((x) => x.accountId === m.accountId && x.threadId === m.threadId) : [m]).sort((p, q) => p.date.localeCompare(q.date))
  const printThread = (m: Message) => {
    platform.printHtml(buildMessageDoc(threadOf(m), m.subject))
    showToast('Opening the print dialog. Choose "Save as PDF" to make a PDF.')
  }
  const popOut = (m: Message) => {
    if (!platform.openWindow(buildMessageDoc(threadOf(m), m.subject))) showToast('The browser blocked the new window. Allow pop-ups for this site.')
  }
  const markAllRead = () => {
    const ids = scope.filter((m) => m.unread).map((m) => m.id)
    if (ids.length === 0) return
    patch(ids, { unread: false })
    showToast(`${ids.length} message${ids.length === 1 ? '' : 's'} marked as read. Ctrl+Z to undo.`)
  }
  const emptyDeleted = () => {
    const gone = new Set(scope.map((m) => m.id))
    setMessages((prev) => prev.filter((m) => !gone.has(m.id)))
    setSelectedId(null)
    setPicked([])
    setConfirmEmpty(false)
    showToast('Deleted Items emptied')
  }
  /** Open: drafts continue in the composer. */
  const openMessage = (id: string) => {
    const m = messages.find((x) => x.id === id)
    if (!m) return
    if (m.folder === 'drafts') openDraft(m)
    else popOut(m)
  }

  const sentLabel = (m: Message): string => {
    const d = new Date(m.date)
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  /** Outlook-style quoted message: a rule, a From/Sent/To/Cc/Subject block, then the original text. No side bar. */
  const quote = (m: Message): string => {
    const who = (p: Person): string => `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;`
    const cc = m.cc && m.cc.length > 0 ? `<br><b>Cc:</b> ${m.cc.map(who).join('; ')}` : ''
    return `<div data-quote="1"><hr><div><b>From:</b> ${who(m.from)}<br><b>Sent:</b> ${escapeHtml(sentLabel(m))}<br><b>To:</b> ${m.to.map(who).join('; ')}${cc}<br><b>Subject:</b> ${escapeHtml(m.subject)}</div><br><div>${textToHtml(m.body)}</div></div>`
  }
  const plainEmail = (m: Message): string => {
    const who = (p: Person): string => `${p.name} <${p.email}>`
    return [`From: ${who(m.from)}`, `Sent: ${sentLabel(m)}`, `To: ${m.to.map(who).join('; ')}`, ...(m.cc && m.cc.length > 0 ? [`Cc: ${m.cc.map(who).join('; ')}`] : []), `Subject: ${m.subject}`, '', m.body].join('\n')
  }
  /** Copy the conversation (or the single message when not grouped) with its header blocks. */
  const copyEmail = async (target?: Message) => {
    const m = target ?? selectedRow?.msg
    if (!m) return
    const msgs = (threaded ? messages.filter((x) => x.accountId === m.accountId && x.threadId === m.threadId) : [m]).sort((p, q) => p.date.localeCompare(q.date))
    const html = `<div data-pm-email="1">${msgs.map(quote).join('')}</div>`
    const text = msgs.map(plainEmail).join('\n________________________________\n')
    rememberCopiedEmail(text, html)
    const ok = await platform.copyRich(html, text)
    showToast(ok ? 'Email copied. Paste it into a message with Ctrl+V.' : 'Copy was blocked by the browser')
  }
  const last = thread[thread.length - 1]
  const reply = (all: boolean) => {
    if (!last) return
    const acc = accountList.find((a) => a.id === accountId)
    const cc = all ? [...last.to, ...(last.cc ?? [])].map((t) => t.email).filter((e) => e !== acc?.email && e !== last.from.email).join(', ') : ''
    openCompose({ to: last.from.email, cc, subject: /^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`, body: quote(last) })
  }
  const forward = () => {
    if (!last) return
    openCompose({ subject: /^fwd?:/i.test(last.subject) ? last.subject : `Fwd: ${last.subject}`, body: quote(last), attachments: last.attachments })
  }

  const retry = () => {
    if (retrying) return
    setRetrying(true)
    window.setTimeout(() => {
      setRetrying(false)
      setSim((s) => (s === 'syncfail' || s === 'ratelimit' || s === 'listerror' ? null : s))
      setLastSync(new Date())
      showToast('Back in sync')
    }, 1000)
  }
  useEffect(() => {
    if (sim !== 'ratelimit') return
    let left = 30
    const t = window.setInterval(() => {
      left -= 1
      setWait(left)
      if (left <= 0) setSim(null)
    }, 1000)
    return () => {
      window.clearInterval(t)
      setWait(30)
    }
  }, [sim])

  const syncNow = () => {
    if (!online || syncing) return
    setSyncing(true)
    window.setTimeout(() => {
      setSyncing(false)
      setLastSync(new Date())
    }, 900)
  }

  const idsOf = (m: Message): string[] => messages.filter((x) => x.accountId === m.accountId && (threaded ? x.threadId === m.threadId : x.id === m.id)).map((x) => x.id)

  type BulkOp =
    | { kind: 'delete' }
    | { kind: 'archive' }
    | { kind: 'toggleRead' }
    | { kind: 'read'; read: boolean }
    | { kind: 'toggleFlag' }
    | { kind: 'toggleImportant' }
    | { kind: 'colour'; c: Colour | undefined }
    | { kind: 'move'; target: FolderSel }

  /** Rows the keyboard and toolbar act on: the whole selection, or the open conversation. */
  const selRows = (): string[] => (multi ? pickedRows : selectedId ? [selectedId] : [])
  /** Rows a row-level action (hover bar, right-click, drag) acts on. */
  const rowsFor = (id: string): string[] => (multi && pickedRows.includes(id) ? pickedRows : [id])

  const rowsToMids = (rowIds: string[]): string[] => {
    const out = new Set<string>()
    for (const id of rowIds) {
      const m = messages.find((x) => x.id === id)
      if (m) for (const x of idsOf(m)) out.add(x)
    }
    return [...out]
  }

  /** The row to open after these rows leave the list. */
  const nextRowAfter = (rowIds: string[]): Row | undefined => {
    const gone = new Set(rowIds)
    const first = Math.min(...rowIds.map((id) => rows.findIndex((r) => r.msg.id === id)).filter((i) => i >= 0))
    const remaining = rows.filter((r) => !gone.has(r.msg.id))
    return remaining[Math.min(Number.isFinite(first) ? first : 0, remaining.length - 1)]
  }

  /** One place for every action on one or many conversations, so keyboard, hover bar, menus and the bulk panel agree. */
  const runOp = (rowIds: string[], op: BulkOp) => {
    const mids = rowsToMids(rowIds)
    if (mids.length === 0) return
    const group = messages.filter((m) => mids.includes(m.id))
    const many = rowIds.length > 1 ? ` (${rowIds.length} conversations)` : ''
    const leave = (label: string) => {
      if (selectedId && rowIds.includes(selectedId)) {
        const next = nextRowAfter(rowIds)
        setSelectedId(next ? next.msg.id : null)
        if (!next) setView('list')
      }
      setPicked([])
      showToast(`${label}${many} · ${MOD}+Z to undo`)
    }
    switch (op.kind) {
      case 'delete':
        patch(mids, { folder: 'deleted' })
        leave('Moved to Deleted Items')
        break
      case 'archive':
        patch(mids, { folder: 'archive' })
        leave('Archived')
        break
      case 'toggleRead':
        patch(mids, { unread: !group.some((m) => m.unread) })
        break
      case 'read':
        patch(mids, { unread: !op.read })
        break
      case 'toggleFlag':
        patch(mids, { flagged: !group.every((m) => m.flagged) })
        break
      case 'toggleImportant':
        patch(mids, { important: !group.every((m) => m.important) })
        break
      case 'colour': {
        patch(mids, { colour: op.c })
        const label = settingsValue.colours.find((c) => c.id === op.c)?.label
        showToast(op.c ? `Category: ${label}${many}` : `Category cleared${many}`)
        break
      }
      case 'move': {
        const t = op.target
        if (group.some((m) => m.accountId !== t.accountId)) {
          showToast("Mail can't be moved between mailboxes")
          return
        }
        if (t.kind === 'case') {
          showToast('Cases fill by themselves from the reference number in the subject')
          return
        }
        if (t.kind === 'folder') {
          if (group.every((m) => m.folder === t.id)) return
          patch(mids, { folder: t.id })
          leave(`Moved to ${FOLDER_TITLES[t.id] ?? t.id}`)
        } else {
          const set = new Set(mids)
          pushUndo(group)
          setMessages((prev) => prev.map((x) => (set.has(x.id) && !x.labels.includes(t.id) ? { ...x, labels: [...x.labels, t.id] } : x)))
          showToast(`Added to ${t.id}${many}`)
        }
        break
      }
    }
  }

  /** Drag onto a sidebar folder or label. Same mailbox only. */
  const dropMessages = (ids: string[], target: FolderSel) => runOp(ids, { kind: 'move', target })

  /** Hover buttons on a message row. Acts on the whole selection when the row is part of it. */
  const rowAction = (id: string, action: 'delete' | 'archive' | 'flag' | 'unread') => {
    const ids = rowsFor(id)
    if (action === 'delete') runOp(ids, { kind: 'delete' })
    else if (action === 'archive') runOp(ids, { kind: 'archive' })
    else if (action === 'flag') runOp(ids, { kind: 'toggleFlag' })
    else runOp(ids, { kind: 'toggleRead' })
  }

  /** Click on a row: plain opens it, Ctrl/Cmd toggles it in the selection, Shift selects a range. */
  const rowClick = (id: string, mods: { ctrl: boolean; shift: boolean }) => {
    if (mods.shift && anchorId.current) {
      const a = rows.findIndex((r) => r.msg.id === anchorId.current)
      const b = rows.findIndex((r) => r.msg.id === id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)]
        setPicked(rows.slice(lo, hi + 1).map((r) => r.msg.id))
        setSelectedId(id)
        return
      }
    }
    if (mods.ctrl) {
      toggleRow(id)
      return
    }
    select(id)
  }
  const toggleRow = (id: string) => {
    const base = pickedRows.length > 0 ? pickedRows : selectedId ? [selectedId] : []
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    anchorId.current = id
    setPicked(next)
    if (next.includes(id)) setSelectedId(id)
    else if (next.length > 0) setSelectedId(next[next.length - 1] as string)
  }

  const ctxEntries = (): MenuEntry[] => {
    if (!ctx) return []
    const m = messages.find((x) => x.id === ctx.id)
    if (!m) return []
    const rowIds = rowsFor(ctx.id)
    const bulkMode = rowIds.length > 1
    const group = messages.filter((x) => rowsToMids(rowIds).includes(x.id))
    const anyUnread = group.some((x) => x.unread)
    const allFlagged = group.every((x) => x.flagged)
    const allImportant = group.every((x) => x.important)
    const targets = (['inbox', 'archive', 'deleted'] as const).filter((f) => f !== m.folder)
    const out: MenuEntry[] = []
    if (bulkMode) out.push({ type: 'head', label: `${rowIds.length} conversations selected` })
    else
      out.push(
        { type: 'item', label: 'Reply', icon: 'reply', tone: 'blue', onSelect: () => reply(false) },
        { type: 'item', label: 'Reply all', icon: 'replyAll', tone: 'blue', onSelect: () => reply(true) },
        { type: 'item', label: 'Forward', icon: 'forward', tone: 'blue', onSelect: forward },
        { type: 'item', label: 'Copy email', icon: 'copy', tone: 'purple', onSelect: () => void copyEmail(m) },
        { type: 'item', label: 'Copy subject', icon: 'copy', onSelect: () => void platform.copyText(m.subject).then((ok) => showToast(ok ? 'Subject copied' : 'Copy was blocked by the browser')) },
        { type: 'item', label: 'Print or save as PDF…', icon: 'download', tone: 'teal', onSelect: () => printThread(m) },
        { type: 'item', label: 'Open in new window', icon: 'expand', onSelect: () => popOut(m) },
        { type: 'item', label: 'Show original', icon: 'draft', onSelect: () => setOriginal(m) },
        { type: 'sep' },
      )
    out.push(
      { type: 'item', label: anyUnread ? 'Mark as read' : 'Mark as unread', icon: 'eye', tone: 'blue', onSelect: () => runOp(rowIds, { kind: 'toggleRead' }) },
      { type: 'item', label: allFlagged ? 'Remove flag' : 'Flag', icon: 'flag', tone: 'orange', onSelect: () => runOp(rowIds, { kind: 'toggleFlag' }) },
      { type: 'item', label: allImportant ? 'Remove importance' : 'Mark as important', icon: 'important', tone: 'red', onSelect: () => runOp(rowIds, { kind: 'toggleImportant' }) },
      { type: 'head', label: 'Colour category' },
      { type: 'swatches', current: bulkMode ? undefined : m.colour, onPick: (c) => runOp(rowIds, { kind: 'colour', c }) },
      { type: 'sep' },
      { type: 'head', label: 'Move to' },
      ...targets.map((f): MenuEntry => ({
        type: 'item',
        label: FOLDER_TITLES[f] ?? f,
        icon: f === 'inbox' ? 'inbox' : f === 'archive' ? 'archive' : 'trash',
        tone: f === 'inbox' ? 'blue' : f === 'archive' ? 'purple' : 'red',
        onSelect: () => runOp(rowIds, { kind: 'move', target: { accountId: m.accountId, kind: 'folder', id: f } }),
        danger: f === 'deleted',
      })),
    )
    return out
  }

  const focusSearch = () => {
    searchEl.current?.focus()
    searchEl.current?.select()
  }
  const goTo = (s: FolderSel) => {
    setScreen('mail')
    setSel(s)
    setSelectedId(null)
    setView('list')
    // Focus the list, unless a dialog opened in the meantime (fast typists).
    window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) document.querySelector<HTMLElement>('.scroller')?.focus()
    }, 0)
  }

  // Keyboard shortcuts (Outlook style). The full list is in src/shortcuts.ts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!entered || screen !== 'mail') return
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select') || t.isContentEditable
      const mod = e.ctrlKey || e.metaKey
      const k = e.key
      const lk = k.length === 1 ? k.toLowerCase() : k
      if (help || jump || refOpen || ctx) return // dialogs and menus own the keyboard

      // ---- global: work even while typing ----
      if (mod && !e.altKey && !e.shiftKey && (lk === 'f' || lk === 'e')) {
        e.preventDefault()
        focusSearch()
        return
      }
      if (k === 'F3') {
        e.preventDefault()
        focusSearch()
        return
      }
      if ((mod && k === '/') || k === 'F1') {
        e.preventDefault()
        setHelp(true)
        return
      }
      if (mod && k === ',') {
        e.preventDefault()
        setScreen('settings')
        return
      }
      if (mod && !e.altKey && !e.shiftKey && (lk === 'y' || lk === 'g') && !typing) {
        e.preventDefault()
        setJump('go')
        return
      }
      if (mod && e.shiftKey && lk === 'i') {
        e.preventDefault()
        goTo({ accountId, kind: 'folder', id: 'inbox' })
        return
      }
      if ((mod && e.shiftKey && lk === 'm') || (mod && !e.shiftKey && !e.altKey && lk === 'n')) {
        e.preventDefault()
        if (!compose) openCompose()
        return
      }
      if (k === 'F9') {
        e.preventDefault()
        syncNow()
        return
      }
      if (compose || typing) return // the composer and text fields keep their own keys

      // ---- message list ----
      const inReader = Boolean(t.closest('.reader-scroll'))
      const idx = rows.findIndex((r) => r.msg.id === selectedId)
      const go = (n: number) => {
        const row = rows[Math.max(0, Math.min(rows.length - 1, n))]
        if (row) select(row.msg.id)
      }
      const colourKey = /^Digit[0-6]$/.test(e.code) ? Number(e.code.slice(5)) : -1

      if (mod && e.shiftKey && !e.altKey && e.code === 'Digit1') {
        if (selRows().length === 0) return
        e.preventDefault()
        runOp(selRows(), { kind: 'toggleImportant' })
      } else if (mod && e.altKey && colourKey >= 0) {
        if (selRows().length === 0) return
        e.preventDefault()
        runOp(selRows(), { kind: 'colour', c: colourKey === 0 ? undefined : settingsValue.colours[colourKey - 1]?.id })
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'a' && !inReader) {
        e.preventDefault()
        setPicked(rows.map((r) => r.msg.id))
        if (!selectedId && rows[0]) setSelectedId(rows[0].msg.id)
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'z') {
        e.preventDefault()
        undo()
      } else if (mod && e.shiftKey && lk === 'v') {
        if (selRows().length === 0) return
        e.preventDefault()
        setJump('move')
      } else if (mod && !e.altKey && lk === 'r') {
        if (!last) return
        e.preventDefault()
        reply(e.shiftKey)
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'p') {
        if (!last) return
        e.preventDefault()
        printThread(last)
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'j') {
        if (!last) return
        e.preventDefault()
        forward()
      } else if (mod && !e.altKey && !e.shiftKey && (lk === 'q' || lk === 'u')) {
        if (selRows().length === 0) return
        e.preventDefault()
        runOp(selRows(), { kind: 'read', read: lk === 'q' })
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'd') {
        if (selRows().length === 0) return
        e.preventDefault()
        runOp(selRows(), { kind: 'delete' })
      } else if (mod && !e.altKey && !e.shiftKey && lk === 'c') {
        // Leave normal text copying alone: only copy the email when nothing is highlighted and focus is not on the attachments.
        if (!selectedRow || window.getSelection()?.toString() || t.closest('.attbar')) return
        e.preventDefault()
        void copyEmail()
      } else if (mod || e.altKey) {
        return
      } else if (k === 'n') {
        e.preventDefault()
        openCompose()
      } else if (k === '/') {
        e.preventDefault()
        focusSearch()
      } else if (k === '?') {
        e.preventDefault()
        setHelp(true)
      } else if (!inReader && e.shiftKey && (k === 'ArrowDown' || k === 'ArrowUp')) {
        // Shift+arrows extend the selection from the anchor.
        e.preventDefault()
        const from = rows.findIndex((r) => r.msg.id === (anchorId.current ?? selectedId))
        const to = Math.max(0, Math.min(rows.length - 1, (idx < 0 ? 0 : idx) + (k === 'ArrowDown' ? 1 : -1)))
        const start = from < 0 ? to : from
        const [lo, hi] = [Math.min(start, to), Math.max(start, to)]
        setPicked(rows.slice(lo, hi + 1).map((r) => r.msg.id))
        if (!anchorId.current && rows[start]) anchorId.current = rows[start].msg.id
        if (rows[to]) setSelectedId(rows[to].msg.id)
      } else if (k === 'Escape' && pickedRows.length > 0) {
        e.preventDefault()
        setPicked([])
      } else if (!inReader && (k === 'ArrowDown' || lk === 'j')) {
        e.preventDefault()
        go(idx + 1)
      } else if (!inReader && (k === 'ArrowUp' || lk === 'k')) {
        e.preventDefault()
        go(idx < 0 ? 0 : idx - 1)
      } else if (!inReader && k === 'Home') {
        e.preventDefault()
        go(0)
      } else if (!inReader && k === 'End') {
        e.preventDefault()
        go(rows.length - 1)
      } else if (!inReader && k === 'PageDown') {
        e.preventDefault()
        go(idx + 10)
      } else if (!inReader && k === 'PageUp') {
        e.preventDefault()
        go(idx - 10)
      } else if (k === 'Enter' && selectedRow && selectedRow.msg.folder === 'drafts') {
        e.preventDefault()
        openDraft(selectedRow.msg)
      } else if (k === 'Enter' && selectedRow) {
        e.preventDefault()
        setView('read')
        window.setTimeout(() => {
          if (!document.querySelector('[role="dialog"]')) document.querySelector<HTMLElement>('.reader-scroll')?.focus()
        }, 0)
      } else if (k === 'Delete' && selRows().length > 0) {
        e.preventDefault()
        runOp(selRows(), { kind: 'delete' })
      } else if ((k === 'Backspace' || lk === 'e') && selRows().length > 0) {
        e.preventDefault()
        runOp(selRows(), { kind: 'archive' })
      } else if (k === 'Insert' && selRows().length > 0) {
        e.preventDefault()
        runOp(selRows(), { kind: 'toggleFlag' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = sel.kind === 'folder' ? (FOLDER_TITLES[sel.id] ?? sel.id) : sel.kind === 'case' ? `Case ${sel.id}` : sel.id
  const showReader = pane !== 'off'

  if (!entered) return <SignIn onPreview={() => setEntered(true)} />

  if (sim === 'expired' || sim === 'denied') {
    return <StatusScreen kind={sim} account={accountList[0]?.email ?? ''} onAction={() => setSim(null)} />
  }

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
          showSmart={showSmart}
          onShowSmart={(v) => {
            setShowSmart(v)
            if (!v) setSmart([])
          }}
          notifications={notif}
          onEnableNotifications={() => void platform.requestNotifications().then(setNotif)}
          onBack={() => setScreen('mail')}
          sim={sim}
          onSim={(p) => {
            setSim(p)
            if (p) setScreen('mail')
          }}
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

  const emptyText = query.trim() ? `No results for “${query.trim()}”` : smart.length > 0 ? 'No messages match these filters' : 'Nothing in this folder'

  return (
    <SettingsContext.Provider value={settingsValue}>
    <div className={`app${sim === 'offline' || !netOnline || sim === 'syncfail' || sim === 'ratelimit' ? ' has-banner' : ''}`} data-density={density}>
      <Toolbar
        query={query}
        onQuery={setQuery}
        recent={recent}
        saved={saved}
        searchAll={searchAll}
        onSearchAll={setSearchAll}
        onCommit={commitSearch}
        onSave={(q) => setSaved([q, ...saved.filter((x) => x !== q)].slice(0, 12))}
        onRemoveSaved={(q) => setSaved(saved.filter((x) => x !== q))}
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
        onHelp={() => setHelp(true)}
        registerSearch={setSearchEl}
      />
      {(!online || sim === 'syncfail' || sim === 'ratelimit') && (
        <StatusBanner kind={!online ? 'offline' : sim === 'ratelimit' ? 'ratelimit' : 'syncfail'} last={lastSync} seconds={wait} busy={retrying} onRetry={retry} />
      )}
      <main className="workspace" data-pane={pane} data-view={view}>
        <FolderPane
          accounts={accountList}
          onAddAccount={() => setAccDlg({ mode: 'add' })}
          onRemoveAccount={(id) => {
            const x = accountList.find((y) => y.id === id)
            if (x) setAccDlg({ mode: 'remove', id, name: x.name, email: x.email })
          }}
          messages={messages}
          selection={sel}
          folders={folders}
          cases={cases}
          onFolderAction={folderAction}
          onReorder={reorderFolder}
          onSelect={(s) => {
            setSel(s)
            setSelectedId(null)
            setView('list')
          }}
          onDropMessage={dropMessages}
        />
        <MessageList
          chips={queryChips}
          onRemoveChip={removeChip}
          allFolders={searchAll && query.trim() !== ''}
          rows={rows}
          selectedId={selectedId}
          density={density}
          smart={showSmart ? smart : []}
          smartCounts={smartCounts}
          showSmart={showSmart}
          onToggleSmart={toggleSmart}
          title={title}
          subtitle={accountList.find((a) => a.id === accountId)?.email ?? ''}
          picked={pickedRows}
          onRowClick={rowClick}
          onToggle={toggleRow}
          onBack={() => setView('folders')}
          onContext={(id, x, y) => {
            if (!(multi && pickedRows.includes(id))) select(id)
            setCtx({ id, x, y })
          }}
          onRowAction={rowAction}
          emptyText={emptyText}
          onOpen={openMessage}
          actions={[
            ...(scope.some((m) => m.unread) ? [{ label: 'Mark all as read', onClick: markAllRead }] : []),
            ...(sel.kind === 'folder' && sel.id === 'deleted' && scope.length > 0 ? [{ label: 'Empty folder', onClick: () => setConfirmEmpty(true), danger: true }] : []),
          ]}
          error={sim === 'listerror' ? { onRetry: retry, busy: retrying } : undefined}
          sync={{ state: !online ? 'offline' : syncing ? 'syncing' : 'synced', last: lastSync }}
          onSync={syncNow}
        />
        {showReader && multi && (
          <BulkPanel
            count={pickedRows.length}
            subjects={pickedRows.map((id) => rows.find((r) => r.msg.id === id)?.msg.subject ?? '')}
            anyUnread={messages.some((m) => rowsToMids(pickedRows).includes(m.id) && m.unread)}
            allFlagged={messages.filter((m) => rowsToMids(pickedRows).includes(m.id)).every((m) => m.flagged)}
            allImportant={messages.filter((m) => rowsToMids(pickedRows).includes(m.id)).every((m) => m.important)}
            onDelete={() => runOp(pickedRows, { kind: 'delete' })}
            onArchive={() => runOp(pickedRows, { kind: 'archive' })}
            onMove={() => setJump('move')}
            onToggleRead={() => runOp(pickedRows, { kind: 'toggleRead' })}
            onToggleFlag={() => runOp(pickedRows, { kind: 'toggleFlag' })}
            onToggleImportant={() => runOp(pickedRows, { kind: 'toggleImportant' })}
            onColour={(c) => runOp(pickedRows, { kind: 'colour', c })}
            onClear={() => setPicked([])}
          />
        )}
        {showReader && !multi && (
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
            onEditDraft={() => selectedRow && openDraft(selectedRow.msg)}
            onMore={(x, y) => selectedRow && setCtx({ id: selectedRow.msg.id, x, y })}
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
          offline={!online}
          pendingTemplate={pendingTemplate}
          onTemplateUsed={() => setPendingTemplate(null)}
          onSend={(d) => {
            if (d.draftId) setMessages((prev) => prev.filter((x) => x.id !== d.draftId))
            upsert(fromCompose(d, `s-${Date.now()}`, 'sent'))
            setCompose(null)
            showToast('Message sent (mock)')
          }}
          onClose={(draft, discarded) => {
            const id = compose?.draftId
            if (discarded && id) setMessages((prev) => prev.filter((x) => x.id !== id))
            else if (draft) upsert(fromCompose(draft, id ?? `d-${Date.now()}`, 'drafts'))
            setCompose(null)
          }}
          onToast={showToast}
        />
      )}
      {/* The entries only read state; the ref the linter sees is the undo stack used inside the actions, called on click. */}
      {/* oxlint-disable-next-line react/refs */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} entries={ctxEntries()} onClose={() => setCtx(null)} />}
      {original && <OriginalDialog msg={original} onClose={() => setOriginal(null)} />}
      {confirmEmpty && (
        <ConfirmDialog title="Empty Deleted Items" confirm="Empty folder" danger onConfirm={emptyDeleted} onClose={() => setConfirmEmpty(false)}>
          Permanently delete {scope.length} message{scope.length === 1 ? '' : 's'} in {accountList.find((x) => x.id === accountId)?.name}? This cannot be undone.
        </ConfirmDialog>
      )}
      {accDlg && <AccountDialog state={accDlg} existing={accountList.map((x) => x.email.toLowerCase())} onAdd={addAccount} onRemove={removeAccount} onClose={() => setAccDlg(null)} />}
      {folderDlg && (
        <FolderDialog
          state={folderDlg}
          accountName={accountList.find((x) => x.id === folderDlg.accountId)?.name ?? ''}
          existing={folders[folderDlg.accountId] ?? []}
          count={folderDlg.mode === 'delete' ? messages.filter((m) => m.accountId === folderDlg.accountId && m.labels.includes(folderDlg.name)).length : 0}
          onSubmit={submitFolder}
          onClose={() => setFolderDlg(null)}
        />
      )}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      {jump && (
        <FolderJump
          mode={jump}
          accounts={accountList}
          folders={folders}
          cases={cases}
          accountId={accountId}
          onClose={() => setJump(null)}
          onPick={(s) => {
            if (jump === 'move') {
              if (selRows().length > 0) dropMessages(selRows(), s)
            } else goTo(s)
          }}
        />
      )}
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
