/* oxlint-disable react/preserve-manual-memoization -- the React Compiler is not part of this build; the rule only notes that it would skip this large component */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Account, Attachment, Colour, ComposeInit, Density, FolderId, MobileView, Message, PaneLayout, Person, Row, Signature } from './types'
import { TEMPLATES } from './data/templates'
import type { Template } from './data/templates'
import { ACCOUNTS, INITIAL_MESSAGES, LABELS } from './data/mock'
import { StatusBanner, StatusScreen } from './components/StatusBanner'
import type { Problem } from './problems'
import { BrandLogo } from './components/BrandLogo'
import { desktop } from './desktop'
import { CONNECT_ERRORS, disconnectAccount, fetchAccounts, fetchAuthConfig, fetchGmailAccess, fetchGmailProfile, fetchSession, saveTitle, signOut } from './auth'
import type { AuthAccount, AuthConfig, AuthUser } from './auth'
import { ConnectDialog } from './components/ConnectDialog'
import { CasePanel } from './components/CasePanel'
import { fetchPerformance, reportMailStats, startHeartbeat } from './activity'
import type { DayStat, StaffMember } from './data/performance'
import { CASE_ERRORS, fetchCasesInfo, fetchOsFacts, fetchPicks, openCase, updateCase } from './cases'
import type { OsFacts } from './cases'
import type { CaseRecord, NewCase } from './cases'
import { GmailError, SESSION_ENDED, findSentByMessageId, getLabel, listMessageIds, getMetadataMany, getProfile, getThreadFull, listLabels } from './gmail/client'
import type { GLabel } from './gmail/client'
import { toMessage } from './gmail/map'
import { mergeMessages, queryFor, syncQuery } from './gmail/sync'
import { fetchChanges } from './gmail/history'
import type { Changes } from './gmail/history'
import { applyLabelIds } from './gmail/map'
import { createLabel, createDraft, deleteDraft, deleteLabel, listDrafts, modifyMessages, modifyThread, renameLabel, sendRaw, updateDraft } from './gmail/client'
import { buildMime, extractInlineImages, outgoingHtml, parseRecipients, toRaw } from './gmail/compose'
import { inlineImageUri } from './gmail/inline'
import type { OutAttachment } from './gmail/compose'
import { forThreads, gid, labelsOn, moveThread, threadsOf } from './gmail/ops'
import { ensureBytes, mockBytes } from './data/mockfile'
import type { Target } from './gmail/sync'
import type { CompanyId } from './data/companies'
import { AccountDialog } from './components/AccountDialog'
import type { AccountDialogState, NewAccount } from './components/AccountDialog'
import { COMPANIES } from './data/companies'
import { FolderDialog } from './components/FolderDialog'
import type { FolderDialogState } from './components/FolderDialog'
import { platform } from './platform'
import { matchesQuery, parseQuery } from './util'
import { DetailsPanel } from './components/DetailsPanel'
import { Welcome } from './components/Welcome'
import { fetchWeather } from './weather'
import type { Weather } from './weather'
import { Notices } from './components/Notices'
import type { HistoryItem } from './components/Toolbar'
import type { Notice, NoticeKind } from './components/Notices'
import { sanitizeEmailHtml } from './mailhtml'
import { escapeHtml, htmlToPlain, textToHtml } from './richtext'
import { bareAddress, displayName } from './data/contacts'
import { WhenDialog } from './components/WhenDialog'
import { fmtWhen } from './when'
import type { WhenMode } from './when'
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
import { PaneSplitter } from './components/PaneSplitter'
import type { RefAnchor } from './components/RefGenerator'
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

/** Wall-clock milliseconds; used by event handlers only (kept out of render logic). */
/** How often Gmail is asked for changes while the tab is visible (hidden tabs: 60 s). */
const POLL_VISIBLE_MS = 5_000

/** Short, plain reason shown in the sync banner (and logged) so a failure can be told apart from the next one. */
const BUSY_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RESOURCE_EXHAUSTED'])
/** What Google's reason words mean, in plain language. */
const REASONS: Record<string, string> = {
  dailyLimitExceeded: 'the daily request limit of this app was reached',
  quotaExceeded: 'a quota was reached',
  accessNotConfigured: 'the Gmail API is switched off for this app in Google Cloud',
  SERVICE_DISABLED: 'the Gmail API is switched off for this app in Google Cloud',
  domainPolicy: 'your Google Workspace administrator blocks this app',
  forbidden: 'Google says this account may not do that',
  appNotAuthorizedToFile: 'the app is not allowed to use this mailbox',
}
function describeError(e: unknown): string {
  console.warn('Pivot Mail sync problem', e)
  if (e instanceof GmailError) {
    const why = REASONS[e.reason]
    if (e.status === 429 || (e.status === 403 && BUSY_REASONS.has(e.reason))) return 'Google says there were too many requests for a moment. It will try again by itself'
    if (e.status === 403) return `Google refused the request (403${e.reason ? `: ${why ?? e.reason}` : ''})`
    return `Google answered with error ${e.status}${e.reason ? ` (${e.reason})` : ''}`
  }
  return 'the connection to Google failed'
}

const stamp = (): number => Date.now()

/**
 * After sign-out the page starts again from nothing: every background check, timer and Gmail key of the person who left is gone at
 * once, rather than relying on each to notice (a shared computer must not keep fetching or alerting someone else's mail).
 */
function restartClean(): void {
  window.location.replace('/')
}

/** What a person leaves on this device: the mail copy, an unsent draft, recent searches, personal templates. */
async function forgetPersonalData(): Promise<void> {
  await platform.cache.clearAll()
  for (const k of ['pm.draft', 'pm.recent', 'pm.saved', 'pm.templates', 'pm.stats']) platform.storage.remove(k)
}

const EMPTY_PERF = { staff: [] as StaffMember[], days: new Map<string, DayStat[]>() }

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
type PaneSizes = { folders?: number; list?: number; height?: number }
const isPanes = (v: unknown): v is PaneSizes => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 4000)
type SigSet = { list: Signature[]; newId: string; replyId: string }
const isSigStore = (v: unknown): v is Record<string, SigSet> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((s) => {
    const x = s as SigSet
    return typeof x === 'object' && x !== null && Array.isArray(x.list) && typeof x.newId === 'string' && typeof x.replyId === 'string' && x.list.every((g) => typeof g?.id === 'string' && typeof g.name === 'string' && typeof g.body === 'string')
  })
const isRecord = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')
const isTemplates = (v: unknown): v is Template[] =>
  Array.isArray(v) && v.every((t) => typeof t === 'object' && t !== null && typeof (t as Template).id === 'string' && typeof (t as Template).name === 'string' && typeof (t as Template).body === 'string' && typeof (t as Template).category === 'string')

const FOLDER_TITLES: Record<string, string> = { inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', deleted: 'Deleted Items', scheduled: 'Scheduled', snoozed: 'Snoozed' }

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
  // Light unless the person switched to dark in the avatar menu (their choice is remembered). Applied to the page itself, so every screen follows.
  const [theme, setTheme] = usePersisted<'light' | 'dark'>('pm.theme', 'light', (v) => v === 'light' || v === 'dark')
  // Windows app: remember the theme so the window opens in the right colour next time (no white flash in dark mode).
  useEffect(() => {
    desktop()?.setTheme?.(theme)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const [pane, setPane] = usePersisted<PaneLayout>('pm.pane', 'right', (v) => ['right', 'bottom', 'off'].includes(v))
  const [density, setDensity] = usePersisted<Density>('pm.density', 'comfortable', (v) => v === 'comfortable' || v === 'compact')
  const [view, setView] = useState<MobileView>('list')
  const [compose, setCompose] = useState<ComposeInit | null>(null)
  const [composeKey, setComposeKey] = useState(0)
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  /** The last notices, kept for the bell in the top bar */
  const [noticeLog, setNoticeLog] = useState<HistoryItem[]>([])
  const [seenLog, setSeenLog] = useState(0)
  const [city, setCity] = usePersisted<string>('pm.city', 'Riyadh', (v) => v.length <= 60)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [detailsOpen, setDetailsOpen] = usePersisted<boolean>('pm.details', true, (v) => v === 'true' || v === 'false')
  const [foldersOpen, setFoldersOpen] = usePersisted<boolean>('pm.folders', true, (v) => v === 'true' || v === 'false')
  const [notif, setNotif] = useState(platform.notificationState())
  const noticeSeq = useRef(0)
  // Nobody is offered a preview any more: the sign-in screen has no such door, and a "stay in the preview" choice remembered by an older
  // version is forgotten. The sample-data version can only be opened with #demo in the address (used by the automated tests).
  const [entered, setEntered] = useState(() => typeof location !== 'undefined' && location.hash === '#demo')
  useEffect(() => {
    platform.storage.remove('pm.entered')
    const onHash = () => setEntered(location.hash === '#demo')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [refOpen, setRefOpen] = useState(false)
  const [refAnchor, setRefAnchor] = useState<RefAnchor | null>(null)
  const [help, setHelp] = useState(false)
  const [jump, setJump] = useState<null | 'go' | 'move'>(null)
  const searchEl = useRef<HTMLInputElement | null>(null)
  const setSearchEl = useCallback((el: HTMLInputElement | null) => {
    searchEl.current = el
  }, [])
  const messagesRef = useRef<Message[]>(INITIAL_MESSAGES)
  const undoStack = useRef<Message[][]>([])
  const [screen, setScreen] = useState<'mail' | 'performance' | 'settings'>('mail')
  const [panes, setPanes] = useStored<PaneSizes>('pm.panes', {}, isPanes)
  const setPane1 = (k: keyof PaneSizes, v: number | null) => {
    const next: PaneSizes = { ...panes }
    if (v === null) delete next[k]
    else next[k] = v
    setPanes(next)
  }
  const [signatures] = useStored<Record<string, string>>('pm.signatures', {}, isRecord) // the earlier single-signature store, still read for people who have not edited their signatures yet
  const [sigStore, setSigStore] = useStored<Record<string, SigSet>>('pm.sigs', {}, isSigStore)
  const [customTemplates, setCustomTemplates] = useStored<Template[]>('pm.templates', [], isTemplates)
  const [colourNames, setColourNames] = useStored<Record<string, string>>('pm.colours', {}, isRecord)
  const [roleState, setRole] = usePersisted<'admin' | 'staff'>('pm.role', 'admin', (v) => v === 'admin' || v === 'staff')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  /** False until the server has said whether someone is signed in, so the sign-in page does not flash first. */
  const [sessionChecked, setSessionChecked] = useState(false)
  // Windows app: nobody signed in (after sign-out, or a session that ended) means the app's small sign-in window, like Outlook's,
  // instead of this page's large sign-in screen.
  const desktopSignedOut = sessionChecked && !authUser && !entered && typeof desktop()?.signedOut === 'function'
  useEffect(() => {
    if (desktopSignedOut) desktop()?.signedOut?.()
  }, [desktopSignedOut])
  /** False until the first list of mailboxes has arrived (or failed), so the app opens ready instead of empty. */
  const [accountsTried, setAccountsTried] = useState(false)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const [authError, setAuthError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('auth_error'))
  // A signed-in person's role comes from the server. Only administrators may preview the staff view.
  const role: 'admin' | 'staff' = authUser ? (authUser.role === 'admin' ? roleState : 'staff') : roleState
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

  useEffect(() => {
    let alive = true
    const load = () => void fetchWeather(city).then((w) => alive && setWeather(w))
    load()
    const t = window.setInterval(load, 30 * 60_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [city])
  const dismissNotice = useCallback((id: number) => setNotices((l) => l.filter((n) => n.id !== id)), [])
  /** One status card. Wording that says something went wrong is shown as an error without every caller having to say so. */
  const showToast = useCallback(
    (text: string, opts?: { kind?: NoticeKind; action?: Notice['action'] }) => {
      const kind = opts?.kind ?? (/\b(couldn'?t|could not|can'?t|cannot|failed|not sent|not allowed|error|refused|blocked|over gmail|please attach|did not accept|didn'?t|not available|unavailable|is not a gmail|can only be|only mail that|put back|try again|offline, so)/i.test(text) ? 'error' : 'success')
      const id = ++noticeSeq.current
      setNotices((l) => [...l.filter((n) => n.text !== text).slice(-2), { id, kind, text, action: opts?.action }])
      setNoticeLog((l) => [{ id, kind, text, at: new Date() }, ...l].slice(0, 15))
      window.setTimeout(() => dismissNotice(id), kind === 'error' ? 9000 : opts?.action ? 7000 : 3500)
    },
    [dismissNotice],
  )

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
    if (realMode) {
      const entry = realUndo.current.pop()
      if (!entry) {
        showToast('Nothing to undo')
        return
      }
      restoreLocal(entry.before)
      showToast('Undone')
      void entry.inverse().catch(() => showToast('Gmail could not undo that change. Refresh the folder to see the real state.'))
      return
    }
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
  // Real mailboxes come from the server once someone has signed in; the preview keeps its sample mailboxes.
  const realMode = authUser !== null

  // Every change made here (delete, move, read, flag...) is also written to this device's copy, so the next visit
  // starts from what you left, not from an older picture. Compared one second after the last change.
  const persisted = useRef<Map<string, Message> | null>(null)
  useEffect(() => {
    if (!realMode) {
      persisted.current = null
      return
    }
    const t = window.setTimeout(() => {
      const prev = persisted.current
      const cur = new Map(messagesRef.current.map((m) => [m.id, m]))
      persisted.current = cur
      if (!prev) return
      const changed = [...cur.values()].filter((m) => prev.get(m.id) !== m && !fromStore.current.has(m))
      const gone = [...prev.keys()].filter((id) => !cur.has(id))
      if (changed.length > 0) void platform.cache.save(changed)
      if (gone.length > 0) void platform.cache.remove(gone)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [messages, realMode])

  const [realAccounts, setRealAccounts] = useState<AuthAccount[] | null>(null)
  const [gmailInfo, setGmailInfo] = useState<Record<string, { total: number } | 'error'>>({})
  const [connectDlg, setConnectDlg] = useState<{ company: CompanyId; kind: 'personal' | 'shared' } | 'new' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<AuthAccount | null>(null)
  const accountList = useMemo<Account[]>(
    () =>
      realMode
        ? (realAccounts ?? []).map((a) => ({ id: a.id, name: a.name, email: a.email, shared: a.kind === 'shared', signature: a.name, status: a.status, company: a.company }))
        : [...ACCOUNTS.filter((a) => !removedIds.includes(a.id)), ...addedAccounts],
    [realMode, realAccounts, addedAccounts, removedIds],
  )

  /* ---------- fast sync: ask Gmail what changed, every few seconds ---------- */
  const historyIds = useRef(new Map<string, string>())
  /** Messages the person just changed here: a slightly older Gmail answer must not flip them back. */
  const recentlyChanged = useRef(new Map<string, number>())
  const touch = useCallback((ids: string[]) => {
    const n = stamp()
    for (const i of ids) recentlyChanged.current.set(i, n)
  }, [])
  const hasReal = (realAccounts?.length ?? 0) > 0
  const inboxUnreadStale = useRef(true)
  const [inboxUnread, setInboxUnread] = useState<Record<string, number>>({})
  const failStreak = useRef(0)
  const pollCount = useRef(0)
  const polling = useRef(false)
  const selRef = useRef(sel)
  const selectedIdRef = useRef(selectedId)
  useEffect(() => {
    selRef.current = sel
    selectedIdRef.current = selectedId
  })

  const setHistory = useCallback((accountId: string, id: string) => {
    historyIds.current.set(accountId, id)
    void platform.cache.setMeta(`hist:${accountId}`, id)
  }, [])

  /** Cases are stored on the server and shared by the company's staff. */
  const [casesDb, setCasesDb] = useState<CaseRecord[] | null>(null)
  const casesAt = useRef(0)
  /** True when the server is connected to Pivot OS: numbers and pick-lists then come from there. */
  const [osLinked, setOsLinked] = useState(false)
  const [osFacts, setOsFacts] = useState<Record<string, OsFacts>>({})
  const [syncDetail, setSyncDetail] = useState('')
  const [caseCompanies, setCaseCompanies] = useState<('scl' | 'tmc')[]>([])
  const loadCases = useCallback(async () => {
    casesAt.current = Date.now()
    const info = await fetchCasesInfo()
    if (info) {
      setCasesDb(info.cases)
      setOsLinked(info.linked)
      setCaseCompanies(info.companies)
    }
  }, [])
  const [labelsByAccount, setLabelsByAccount] = useState<Record<string, GLabel[]>>({})
  const labelsRef = useRef<Record<string, GLabel[]>>({})
  const realAccountsRef = useRef<AuthAccount[]>([])
  const lastSynced = useRef(new Map<string, number>())
  /** Folders whose newest mail was fully re-read this session (see syncTarget). */
  const freshened = useRef(new Set<string>())
  const runId = useRef(0)
  /** Search results for one search (key: the words + where it searches). Local hits (desktop app) and Gmail's hits add up. */
  const [liveSearch, setLiveSearch] = useState<{ key: string; ids: Set<string> } | null>(null)

  /** Everything fetched from Gmail goes through here: into the list and into this device's local copy. */
  const mergeIn = useCallback((msgs: Message[]) => {
    setMessages((prev) => {
      // What Gmail sends back a moment after a change made here may still be the old picture: keep what the person just did.
      const now = stamp()
      const guarded = msgs.map((x) => {
        if (now - (recentlyChanged.current.get(x.id) ?? 0) >= 8000) return x
        const mine = prev.find((y) => y.id === x.id)
        return mine ? { ...x, folder: mine.folder, labels: mine.labels, unread: mine.unread, flagged: mine.flagged, important: mine.important } : x
      })
      return mergeMessages(prev, guarded)
    })
    void platform.cache.save(msgs)
  }, [])

  /** Messages that are gone for good: out of the list and out of this device's copy. */
  const dropGone = useCallback((ids: string[]) => {
    const gone = new Set(ids)
    for (const id of ids) goneIds.current.add(id)
    setMessages((prev) => prev.filter((m) => !gone.has(m.id)))
    void platform.cache.remove(ids)
  }, [])

  /** Messages known to be gone this session: a stored copy read a moment earlier must not bring one back. */
  const goneIds = useRef(new Set<string>())
  /** Copies read from this device's store: already saved there, so they are not saved again. */
  const fromStore = useRef(new WeakSet<Message>())
  /**
   * Adds copies from this device's store to what is on screen. What is on screen is never older than the store: a stored copy only
   * fills in what is missing (a message not on screen, or the full text of one on screen as a list line), and read, flag and folder
   * always stay as they are on screen (a change made a second ago may not be stored yet).
   */
  const addStored = useCallback((stored: Message[]) => {
    const usable = stored.filter((m) => !goneIds.current.has(m.id))
    if (usable.length === 0) return
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      let changed = false
      for (const m of usable) {
        const cur = byId.get(m.id)
        let next: Message | null = null
        if (!cur) next = m
        else if (!cur.loaded && m.loaded) next = { ...m, folder: cur.folder, labels: cur.labels, unread: cur.unread, flagged: cur.flagged, important: cur.important }
        if (next) {
          fromStore.current.add(next)
          byId.set(m.id, next)
          changed = true
        }
      }
      return changed ? [...byId.values()] : prev
    })
  }, [])

  const ensureLabels = useCallback(async (accountId: string): Promise<GLabel[]> => {
    const have = labelsRef.current[accountId]
    if (have) return have
    const list = await listLabels(accountId)
    labelsRef.current = { ...labelsRef.current, [accountId]: list }
    setLabelsByAccount(labelsRef.current)
    return list
  }, [])

  const markReconnect = useCallback((accountId: string) => {
    setRealAccounts((list) => (list ?? []).map((x) => (x.id === accountId ? { ...x, status: 'needs_reconnect' } : x)))
  }, [])

  /** Proves the saved permission still works and reads the mailbox size straight from Gmail (the browser talks to Gmail directly). */
  const checkMailbox = useCallback(async (a: AuthAccount) => {
    const access = await fetchGmailAccess(a.id)
    if ('error' in access) {
      setGmailInfo((i) => ({ ...i, [a.id]: 'error' }))
      if (access.error === 'reconnect') markReconnect(a.id)
      return
    }
    const p = await fetchGmailProfile(access.accessToken)
    setGmailInfo((i) => ({ ...i, [a.id]: p ? { total: p.messagesTotal } : 'error' }))
  }, [markReconnect])

  /** Bring a folder (or the inboxes of all mailboxes, or a case) up to date. A newer choice cancels an older one still running. */
  const syncTarget = useCallback(
    async (s: FolderSel, force = false) => {
      const accounts = realAccountsRef.current
      const jobs: { accountId: string; t: Target }[] =
        s.kind === 'all' ? accounts.map((x) => ({ accountId: x.id, t: { kind: 'folder', id: 'inbox' } })) : [{ accountId: s.accountId, t: { kind: s.kind, id: s.id } }]
      const my = ++runId.current
      setSyncing(true)
      let current = ''
      try {
        for (const { accountId, t } of jobs) {
          const acc = accounts.find((x) => x.id === accountId)
          if (!acc || acc.status === 'needs_reconnect') continue
          current = accountId
          const key = `${accountId}/${t.kind}/${t.id}`
          if (!force && stamp() - (lastSynced.current.get(key) ?? 0) < 60_000) continue
          const labels = await ensureLabels(accountId)
          const query = queryFor(t, acc.syncWindowDays, labels)
          if (!query) continue
          const known = new Map(messagesRef.current.filter((m) => m.accountId === accountId).map((m) => [m.id, m]))
          await syncQuery({
            accountId,
            query,
            known,
            labelNames: Object.fromEntries(labels.map((l) => [l.id, l.name])),
            isCancelled: () => runId.current !== my,
            // The newest 100 are re-read the first time a folder is synced in this session (catches anything changed while the
            // app was closed; batched, a few requests). After that Gmail's change log, followed every few seconds, brings
            // read/flag/move changes, so re-reading them on every visit would only repeat that work.
            refreshNewest: historyIds.current.has(accountId) && freshened.current.has(key) ? 0 : 100,
            onBatch: mergeIn,
            // A folder view also checks that nothing is listed here which Gmail has moved or deleted.
            reconcile: t.kind === 'folder' && ['inbox', 'sent', 'drafts', 'deleted', 'archive'].includes(t.id) ? { folder: t.id as Message['folder'], windowDays: t.id === 'drafts' ? 0 : acc.syncWindowDays } : undefined,
            onGone: dropGone,
          })
          if (runId.current === my) {
            lastSynced.current.set(key, stamp())
            freshened.current.add(key)
          }
        }
        if (runId.current === my) {
          setLastSync(new Date())
          setSim((v) => (v === 'syncfail' ? null : v))
        }
      } catch (e) {
        if (runId.current === my) {
          if (e instanceof GmailError && e.status === SESSION_ENDED) setSim('expired')
          else if (e instanceof GmailError && e.status === 401 && current) markReconnect(current)
          else {
            setSyncDetail(describeError(e))
            setSim('syncfail')
          }
        }
      } finally {
        if (runId.current === my) setSyncing(false)
      }
    },
    [ensureLabels, mergeIn, markReconnect, dropGone],
  )

  /** Fetch the whole conversation (bodies, attachments) when it is opened. */
  const loadThread = useCallback(
    async (m: Message, force = false) => {
      const have = messagesRef.current.filter((x) => x.accountId === m.accountId && x.threadId === m.threadId)
      if (!force && have.length > 0 && have.every((x) => x.loaded)) return have
      // Windows app: the conversation is usually stored complete on this computer; open it from there at once.
      if (!force) {
        const local = await (platform.cache.thread(m.accountId, m.threadId) ?? Promise.resolve([]))
        if (local.length > 0 && local.length >= have.length && local.every((x) => x.loaded) && have.every((h) => local.some((x) => x.id === h.id))) {
          addStored(local)
          return local
        }
      }
      try {
        const labels = await ensureLabels(m.accountId)
        const full = await getThreadFull(m.accountId, m.threadId)
        const names = Object.fromEntries(labels.map((l) => [l.id, l.name]))
        const msgs = full.map((g) => toMessage(m.accountId, g, names)).filter((x): x is Message => x !== null)
        mergeIn(msgs)
        return msgs
      } catch {
        showToast('Could not open this message. Please try again.')
        return []
      }
    },
    [ensureLabels, mergeIn, showToast, addStored],
  )

  const loadAccounts = useCallback(async (early?: Promise<AuthAccount[] | null>) => {
    const list = await (early ?? fetchAccounts())
    setAccountsTried(true)
    if (list === null) return
    realAccountsRef.current = list
    setRealAccounts(list)
    setSel((s) => (list.some((a) => a.id === s.accountId) ? s : list[0] ? { accountId: list[0].id, kind: 'folder', id: 'inbox' } : s))
    for (const a of list) {
      void checkMailbox(a)
      void ensureLabels(a.id).catch(() => undefined)
      void platform.cache.load(a.id).then(addStored)
      // Where change tracking continues: the saved point, or "now" for a mailbox seen for the first time.
      void platform.cache.getMeta(`hist:${a.id}`).then((v) => {
        if (v) historyIds.current.set(a.id, v)
        else void getProfile(a.id).then((p) => setHistory(a.id, p.historyId)).catch(() => undefined)
      })
    }
  }, [checkMailbox, ensureLabels, setHistory, addStored])
  useEffect(() => {
    if (!desktop() || !authUser) return
    let last = 0
    const onFocus = () => {
      if (Date.now() - last < 10_000) return
      last = Date.now()
      // Only a real change (a mailbox added or removed in the browser) reloads the mailboxes.
      void fetchAccounts().then((list) => {
        if (!list) return
        const was = realAccountsRef.current.map((x) => `${x.id}:${x.status}`).sort().join()
        const now = list.map((x) => `${x.id}:${x.status}`).sort().join()
        if (was !== now) void loadAccounts()
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [authUser, loadAccounts])
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const connected = q.get('connected')
    const connectError = q.get('connect_error')
    if (q.has('auth_error') || connected || connectError) window.history.replaceState(null, '', window.location.pathname)
    void fetchAuthConfig().then(setAuthConfig)
    // Someone signed in here before: ask for the mailbox list at the same time as the sign-in check (the answer belongs to
    // whoever the session cookie is, so it is only used once that session is confirmed). Saves one round trip at every start.
    const early = platform.storage.get('pm.lastuser') ? fetchAccounts().catch(() => null) : undefined
    void fetchSession().then(async (u) => {
      if (u) {
        // Someone else on this device? Their mail copy and unsent draft must not stay behind.
        const last = platform.storage.get('pm.lastuser')
        if (last && last !== u.email.toLowerCase()) {
          await forgetPersonalData()
          platform.storage.set('pm.lastuser', u.email.toLowerCase())
          window.location.reload() // start clean: nothing of the previous person is left in memory either
          return
        }
        platform.storage.set('pm.lastuser', u.email.toLowerCase())
      }
      setAuthUser(u)
      setSessionChecked(true)
      if (!u) return
      setMessages([]) // a real person never sees the sample mail
      void loadCases()
      // After connecting a mailbox the list has just changed: ask again rather than use the early answer.
      void loadAccounts(connected || connectError ? undefined : early).then(() => {
        if (connected) showToast(`${connected} connected`)
        else if (connectError) showToast(CONNECT_ERRORS[connectError] ?? 'The mailbox could not be connected.')
      })
    })
  }, [loadAccounts, loadCases, showToast])


  /** Clicking a new-mail alert: that mailbox's Inbox opens, with the message open (several messages: just the Inbox). */
  const openFromAlert = useRef<string | null>(null)
  const [alertTick, setAlertTick] = useState(0)
  const alertOpen = useRef<(m: Message) => void>(() => {})
  useEffect(() => {
    alertOpen.current = (m) => {
      setQuery('')
      setSmart([])
      setSel({ accountId: m.accountId, kind: 'folder', id: 'inbox' })
      openFromAlert.current = m.id || null
      setAlertTick((t) => t + 1)
    }
  })

  /** "Mark as read" on a Windows alert: the same as marking it read in the list (also in Gmail). */
  const alertRead = useRef<(id: string) => void>(() => {})
  useEffect(() => {
    // An alert clicked while Pivot Mail was closed starts the app first: the mail may not be loaded yet, so it waits (up to 15 s).
    const handle = (a: { action: string; accountId: string; messageId: string }, tries = 0) => {
      const m = messagesRef.current.find((x) => x.id === a.messageId)
      const base = messagesRef.current.find((x) => x.accountId === a.accountId)
      if (!(m || (a.action !== 'read' && base)) && tries < 15) {
        window.setTimeout(() => handle(a, tries + 1), 1000)
        return
      }
      if (a.action === 'read') {
        if (m) alertRead.current(m.id)
      } else if (a.action === 'open' && m) alertOpen.current(m)
      else if (base) alertOpen.current({ ...base, id: '' }) // the Inbox of that mailbox
    }
    // A newer Windows app has been downloaded: say so, with "Restart now" (otherwise it installs when Pivot Mail is next closed).
    // Registered before the alert clicks, because the app sends this as soon as the page says it is ready.
    desktop()?.onUpdateReady?.((v) =>
      showToast(`Pivot Mail ${v} is ready. It installs when Pivot Mail restarts.`, { kind: 'info', action: { label: 'Restart now', onClick: () => desktop()?.restartToUpdate?.() } }),
    )
    desktop()?.onMailAction?.((a) => handle(a))
  }, [showToast])

  /**
   * New-mail alert. In the Windows app: a real Windows alert like Outlook's (initials picture, sender, subject, first line,
   * mailbox, Open / Mark as read). Elsewhere, or if Windows cannot show it: the browser's simpler alert.
   */
  const notifyNewMail = useCallback(async (accountId: string, fresh: Message[], mailbox: string) => {
    const one = fresh[0]
    if (!one) return
    const app = desktop()
    if (app?.notifyMail) {
      const shown =
        fresh.length === 1
          ? await app.notifyMail({ kind: 'one', accountId, messageId: one.id, sender: one.from.name || one.from.email, subject: one.subject, preview: (one.body || '').replace(/\s+/g, ' ').slice(0, 200), mailbox }, { name: one.from.name, email: one.from.email })
          : await app.notifyMail({ kind: 'many', accountId, count: fresh.length, mailbox, lines: fresh.slice(0, 3).map((m) => ({ sender: m.from.name || m.from.email, subject: m.subject })) }, { name: mailbox, email: mailbox })
      if (shown) return
    }
    if (fresh.length === 1) platform.notify(one.from.name || one.from.email || 'New mail', one.subject || '(no subject)', () => alertOpen.current(one))
    else platform.notify(`${fresh.length} new messages`, fresh.map((m) => m.from.name || m.from.email).slice(0, 3).join(', '), () => alertOpen.current({ ...one, id: '' }))
  }, [])

  const applyChanges = useCallback(
    async (accountId: string, r: Changes) => {
      const labels = await ensureLabels(accountId)
      const names = Object.fromEntries(labels.map((l) => [l.id, l.name]))
      const now = stamp()
      const fresh = (i: string) => now - (recentlyChanged.current.get(`${accountId}:${i}`) ?? 0) < 8000

      if (r.deleted.size > 0) {
        const ids = new Set([...r.deleted].map((i) => `${accountId}:${i}`))
        setMessages((prev) => prev.filter((m) => !ids.has(m.id)))
        void platform.cache.remove([...ids])
      }

      const known = new Map(messagesRef.current.filter((m) => m.accountId === accountId).map((m) => [m.id, m]))
      const updates = new Map<string, string[]>()
      const fetchIds: string[] = []
      for (const [i, v] of r.labels) {
        const id = `${accountId}:${i}`
        if (known.has(id)) {
          if (!fresh(i)) updates.set(id, v.labelIds)
        } else if (r.added.has(i) || v.labelIds.includes('INBOX')) fetchIds.push(i)
      }
      if (updates.size > 0) {
        const next: Message[] = []
        const dropped: string[] = []
        for (const [id, lids] of updates) {
          const m = known.get(id)
          const changed = m ? applyLabelIds(m, lids, names) : null
          if (changed) next.push(changed)
          else dropped.push(id)
        }
        if (dropped.length > 0) {
          for (const id of dropped) goneIds.current.add(id)
          setMessages((prev) => prev.filter((m) => !dropped.includes(m.id)))
        }
        mergeIn(next)
      }

      let added: Message[] = []
      if (fetchIds.length > 0) {
        const got = await getMetadataMany(accountId, fetchIds)
        added = got.map((g) => toMessage(accountId, g, names)).filter((x): x is Message => x !== null)
        mergeIn(added)
        lastSynced.current.delete(`${accountId}/folder/inbox`)
      }

      // The conversation on screen picks up new replies at once.
      const open = messagesRef.current.find((m) => m.id === selectedIdRef.current)
      if (open && open.accountId === accountId && added.some((m) => m.threadId === open.threadId)) void loadThread(open, true)

      // Alert for new unread mail in the Inbox, not for what we sent ourselves.
      const me = realAccountsRef.current.find((x) => x.id === accountId)?.email
      const fresh2 = added.filter((m) => m.folder === 'inbox' && m.unread && m.from.email !== me && !known.has(m.id))
      if (fresh2.length > 0) void notifyNewMail(accountId, fresh2, me ?? '')
    },
    [ensureLabels, mergeIn, loadThread, notifyNewMail],
  )

  const pollAccount = useCallback(
    async (a: AuthAccount) => {
      let start = historyIds.current.get(a.id)
      if (!start) {
        start = (await getProfile(a.id)).historyId
        setHistory(a.id, start)
        return
      }
      const r = await fetchChanges(a.id, start)
      if (r === 'expired') {
        // Gmail no longer remembers that point: read the open folders again from scratch.
        setHistory(a.id, (await getProfile(a.id)).historyId)
        lastSynced.current.clear()
        freshened.current.clear() // nothing can be assumed: re-read the newest mail of every folder
        const s = selRef.current
        void syncTarget(s, true)
        return
      }
      const changed = r.added.size + r.deleted.size + r.labels.size > 0
      if (changed) await applyChanges(a.id, r)
      if (r.latestId !== start) setHistory(a.id, r.latestId)
      if (changed || inboxUnreadStale.current) {
        const l = await getLabel(a.id, 'INBOX')
        setInboxUnread((u) => ({ ...u, [a.id]: l.messagesUnread ?? 0 }))
      }
    },
    [applyChanges, setHistory, syncTarget],
  )
  const pollAll = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      const list = realAccountsRef.current.filter((x) => x.status !== 'needs_reconnect')
      for (const a of list) await pollAccount(a)
      inboxUnreadStale.current = false
      pollCount.current += 1
      // Cases change rarely: refresh about once a minute whatever the mail polling speed is.
      if (Date.now() - casesAt.current >= 60_000) {
        casesAt.current = Date.now()
        void loadCases()
      }
      failStreak.current = 0
      setLastSync(new Date())
      setSim((v) => (v === 'syncfail' ? null : v))
    } catch (e) {
      failStreak.current += 1
      if (e instanceof GmailError && e.status === SESSION_ENDED) setSim('expired')
      else if (e instanceof GmailError && e.status === 401) {
        /* the key is refreshed by the next call */
      } else if (failStreak.current >= 3) {
        setSyncDetail(describeError(e))
        setSim('syncfail')
      }
    } finally {
      polling.current = false
    }
  }, [pollAccount, loadCases])
  const pollRef = useRef(pollAll)
  useEffect(() => {
    pollRef.current = pollAll
  })

  // Every 5 s while the tab is open, 60 s when it is a hidden browser tab, backing off while Gmail is unreachable; at once on return or
  // reconnect. The Windows app keeps the 5 s pace while hidden in the tray: it is the mail program, and alerts must not wait a minute.
  useEffect(() => {
    if (!realMode || !hasReal) return
    let timer: number | undefined
    let last = 0
    const app = desktop() !== null
    const delay = () => Math.min(120_000, (app || document.visibilityState === 'visible' ? POLL_VISIBLE_MS : 60_000) * 2 ** Math.min(failStreak.current, 3))
    // One loop only, and it ends with this effect (sign-out, last mailbox removed): a check still running when that happens
    // finishes without scheduling another.
    let stopped = false
    let running = false
    const loop = async () => {
      if (stopped || running) return
      running = true
      last = stamp()
      try {
        await pollRef.current()
      } finally {
        running = false
      }
      if (!stopped) timer = window.setTimeout(() => void loop(), delay())
    }
    const wake = () => {
      if (running || stamp() - last < 4000) return
      window.clearTimeout(timer)
      void loop()
    }
    const onVis = () => document.visibilityState === 'visible' && wake()
    timer = window.setTimeout(() => void loop(), 3000)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
    }
  }, [realMode, hasReal])

  // Usage figures for the administrator's page: active minutes, and the person's own mail counts measured in Gmail.
  useEffect(() => {
    if (!authUser) return
    return startHeartbeat()
  }, [authUser])
  useEffect(() => {
    if (!realMode || !hasReal) return
    const run = () => {
      const ids = realAccountsRef.current.filter((x) => x.kind === 'personal' && x.status === 'active').map((x) => x.id)
      if (ids.length > 0) void reportMailStats(ids).catch(() => undefined)
    }
    const first = window.setTimeout(run, 8000)
    const every = window.setInterval(run, 30 * 60_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(every)
    }
  }, [realMode, hasReal])

  // Real mail: fetch whenever another folder (or mailbox) is opened.
  const selKey = `${sel.accountId}|${sel.kind}|${sel.id}`
  useEffect(() => {
    if (!realMode || !hasReal) return
    const [accountId, kind, id] = selKey.split('|') as [string, FolderSel['kind'], string]
    // A short delay also absorbs rapid folder switching.
    const t = window.setTimeout(() => void syncTarget({ accountId, kind, id } as FolderSel), 120)
    return () => window.clearTimeout(t)
  }, [realMode, hasReal, selKey, syncTarget])

  const accounts = useMemo<Account[]>(
    () =>
      accountList.map((a) => {
        const s = sigStore[a.id]
        // Not edited yet: the one signature the mailbox always had (or its default) becomes the only entry.
        const legacy = signatures[a.id] ?? a.signature
        const list: Signature[] = s ? s.list : legacy.trim() ? [{ id: 'main', name: 'Main', body: legacy }] : []
        const newId = s ? s.newId : (list[0]?.id ?? '')
        const replyId = s ? s.replyId : newId
        return { ...a, signature: list.find((g) => g.id === newId)?.body ?? '', signatures: list, sigNew: newId, sigReply: replyId }
      }),
    [accountList, signatures, sigStore],
  )
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
    if (realMode) {
      // Real mailboxes: the company's shared case list from the server, newest first.
      return Object.fromEntries(accountList.map((acc) => [acc.id, (casesDb ?? []).filter((c) => c.company === acc.company).map((c) => c.ref)])) as Record<string, string[]>
    }
    const out: Record<string, Map<string, string>> = {}
    for (const m of messages) {
      if (m.folder === 'deleted') continue
      for (const ref of m.subject.match(/\bP[ST]\d{7}\b/g) ?? []) {
        const map = (out[m.accountId] ??= new Map<string, string>())
        if ((map.get(ref) ?? '') < m.date) map.set(ref, m.date)
      }
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([r]) => r)])) as Record<string, string[]>
  }, [messages, realMode, accountList, casesDb])
  const caseNames = useMemo(() => (realMode ? Object.fromEntries((casesDb ?? []).map((c) => [c.ref, c.client])) : undefined), [realMode, casesDb])
  /** Real mailboxes show their Gmail labels as folders; the preview keeps its own list. */
  const foldersView = useMemo<Record<string, string[]>>(
    () => (realMode ? Object.fromEntries(Object.entries(labelsByAccount).map(([id, ls]) => [id, ls.filter((l) => l.type === 'user').map((l) => l.name).sort((x, y) => x.localeCompare(y))])) : folders),
    [realMode, labelsByAccount, folders],
  )
  const [folderDlg, setFolderDlg] = useState<FolderDialogState | null>(null)
  const folderAction = (accountId: string, action: 'new' | 'rename' | 'delete', name?: string) =>
    setFolderDlg(action === 'new' ? { mode: 'new', accountId } : { mode: action, accountId, name: name ?? '' })
  const reorderFolder = (accountId: string, name: string, before: string | null) => {
    if (realMode) {
      showToast('Gmail lists folders alphabetically, so they cannot be reordered.')
      return
    }
    const list = (folders[accountId] ?? []).filter((x) => x !== name)
    const at = before === null ? list.length : list.indexOf(before)
    list.splice(at < 0 ? list.length : at, 0, name)
    setFolders({ ...folders, [accountId]: list })
  }
  /** Real mailboxes: folders are Gmail labels. */
  const submitFolderReal = async (value: string) => {
    const dlg = folderDlg
    if (!dlg) return
    setFolderDlg(null)
    const labels = labelsRef.current[dlg.accountId] ?? []
    const setLabels = (next: GLabel[]) => {
      labelsRef.current = { ...labelsRef.current, [dlg.accountId]: next }
      setLabelsByAccount(labelsRef.current)
    }
    try {
      if (dlg.mode === 'new') {
        const l = await createLabel(dlg.accountId, value)
        setLabels([...labels, { ...l, type: l.type ?? 'user' }])
        showToast(`Folder “${value}” created`)
      } else if (dlg.mode === 'rename') {
        const l = labels.find((x) => x.name === dlg.name)
        if (!l || value === dlg.name) return
        await renameLabel(dlg.accountId, l.id, value)
        setLabels(labels.map((x) => (x.id === l.id ? { ...x, name: value } : x)))
        setMessages((prev) => prev.map((m) => (m.accountId === dlg.accountId && m.labels.includes(dlg.name) ? { ...m, labels: m.labels.map((n) => (n === dlg.name ? value : n)) } : m)))
        if (sel.kind === 'label' && sel.accountId === dlg.accountId && sel.id === dlg.name) setSel({ ...sel, id: value })
        showToast(`Renamed to “${value}”`)
      } else {
        const l = labels.find((x) => x.name === dlg.name)
        if (!l) return
        await deleteLabel(dlg.accountId, l.id)
        setLabels(labels.filter((x) => x.id !== l.id))
        setMessages((prev) => prev.map((m) => (m.accountId === dlg.accountId && m.labels.includes(dlg.name) ? { ...m, labels: m.labels.filter((n) => n !== dlg.name) } : m)))
        if (sel.kind === 'label' && sel.accountId === dlg.accountId && sel.id === dlg.name) {
          setSel({ accountId: dlg.accountId, kind: 'folder', id: 'inbox' })
          setSelectedId(null)
        }
        showToast(`Folder “${dlg.name}” deleted. No mail was deleted.`)
      }
    } catch {
      showToast('Gmail did not accept that change. Please try again.')
    }
  }
  const submitFolder = (value: string) => {
    if (realMode) {
      void submitFolderReal(value)
      return
    }
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
  const liveQuery = query.trim()
  const liveKey = `${liveQuery}\u0000${selKey}\u0000${searchAll ? 1 : 0}`
  const liveOn = realMode && liveQuery !== '' && liveSearch !== null && liveSearch.key === liveKey
  const liveKeyRef = useRef(liveKey)
  useEffect(() => {
    liveKeyRef.current = liveKey
  }, [liveKey])
  /** Adds results to the current search. A slow answer for words typed earlier arrives too late to count and is ignored. */
  const addLiveHits = useCallback((key: string, ids: Iterable<string>) => {
    if (key !== liveKeyRef.current) return
    setLiveSearch((cur) => ({ key, ids: new Set([...(cur?.key === key ? cur.ids : []), ...ids]) }))
  }, [])
  /**
   * Windows app: everything stored on this computer is searched the moment a word is typed (well under a second, any age the
   * computer holds). Gmail's own search below still runs and adds anything not stored here.
   */
  useEffect(() => {
    if (!realMode || liveQuery === '') return
    let cancelled = false
    const t = window.setTimeout(() => {
      const [, kind, id = ''] = selKey.split('|')
      const targets = kind === 'all' ? realAccountsRef.current.map((x) => x.id) : [accountId]
      const found = platform.cache.search(targets, liveQuery)
      if (!found) return
      void found.then((hits) => {
        if (cancelled) return
        // The same places Gmail searches: the open folder or label, or (all mail / search everywhere) everything except Deleted.
        const inScope = hits.filter((m) => (searchAll || kind === 'all' ? m.folder !== 'deleted' : kind === 'label' ? m.labels.includes(id) : kind === 'folder' ? m.folder === id : true))
        if (inScope.length === 0) return
        addStored(inScope)
        addLiveHits(liveKey, inScope.map((m) => m.id))
      })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [realMode, liveQuery, liveKey, accountId, searchAll, selKey, addLiveHits, addStored])
  /** Real mail: Gmail's own search (any age). Results appear as they arrive; until then the loaded mail is filtered locally. */
  useEffect(() => {
    if (!realMode || liveQuery === '') return
    const t = window.setTimeout(() => {
      const acc = accountId
      const folderQ: Record<string, string> = { inbox: 'in:inbox', sent: 'in:sent', drafts: 'in:drafts', deleted: 'in:trash', archive: '-in:inbox -in:sent -in:drafts -in:trash -in:spam' }
      const scopeQ = searchAll || selKey.split('|')[1] === 'all' ? '' : selKey.split('|')[1] === 'label' ? `label:"${selKey.split('|')[2]}"` : selKey.split('|')[1] === 'folder' ? (folderQ[selKey.split('|')[2] ?? ''] ?? '') : ''
      const ids = new Set<string>()
      const targets = selKey.split('|')[1] === 'all' ? realAccountsRef.current.map((x) => x.id) : [acc]
      void Promise.all(
        targets.map(async (accountId2) => {
          const labels = await ensureLabels(accountId2)
          const known = new Map(messagesRef.current.filter((m) => m.accountId === accountId2).map((m) => [m.id, m]))
          await syncQuery({
            accountId: accountId2,
            query: { q: `${liveQuery} ${scopeQ}`.trim() },
            known,
            labelNames: Object.fromEntries(labels.map((l) => [l.id, l.name])),
            cap: 100,
            // Results already on this computer are shown as they are; only mail not seen before is fetched.
            refreshNewest: 0,
            onIds: (all) => {
              for (const id of all) if (known.has(id)) ids.add(id)
              addLiveHits(liveKey, ids)
            },
            onBatch: (ms) => {
              mergeIn(ms)
              for (const m of ms) ids.add(m.id)
              addLiveHits(liveKey, ids)
            },
          })
        }),
      )
        .then(() => addLiveHits(liveKey, ids))
        .catch(() => showToast('Gmail search is not available right now. Showing mail already loaded.'))
    }, 450)
    return () => window.clearTimeout(t)
  }, [realMode, liveQuery, liveKey, accountId, searchAll, selKey, ensureLabels, mergeIn, showToast, addLiveHits])

  /** Messages of the open folder or label, before search and smart filters. */
  const scope = useMemo(
    () =>
      messages.filter((m) => {
        if (liveOn) return liveSearch !== null && liveSearch.ids.has(m.id)
        // Real mail: a folder shows the indexed window only; older mail is reached by search (it may be cached from an earlier search).
        if (realMode && sel.kind !== 'case' && m.folder !== 'drafts') {
          const days = realAccounts?.find((x) => x.id === m.accountId)?.syncWindowDays ?? 90
          if (new Date(m.date).getTime() < now.getTime() - days * 86_400_000) return false
        }
        if (sel.kind === 'all') return searchAll && query.trim() !== '' ? m.folder !== 'deleted' : m.folder === 'inbox'
        if (m.accountId !== accountId) return false
        if (searchAll && query.trim() !== '') return m.folder !== 'deleted'
        if (sel.kind === 'case') return m.folder !== 'deleted' && m.subject.includes(sel.id)
        return sel.kind === 'folder' ? m.folder === sel.id : m.folder === 'inbox' && m.labels.includes(sel.id)
      }),
    [messages, accountId, sel, searchAll, query, liveOn, liveSearch, realMode, realAccounts, now],
  )
  const smartCounts = useMemo(() => Object.fromEntries(SMART.map((d) => [d.id, scope.filter((m) => d.test(m, now)).length])) as Record<SmartKey, number>, [scope, now])
  const toggleSmart = (k: SmartKey) => setSmart((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  const rows = useMemo<Row[]>(() => {
    const parsed = parseQuery(query)
    const active = new Set(smart)
    const inScope = scope.filter((m) => (liveOn || matchesQuery(m, parsed)) && smartMatches(m, active, now))
    inScope.sort((a, b) => b.date.localeCompare(a.date))
    if (!threaded) return inScope.map((msg) => ({ msg, count: 1, unread: msg.unread }))
    const byThread = new Map<string, Row>()
    for (const msg of inScope) {
      const row = byThread.get(`${msg.accountId}/${msg.threadId}`)
      if (!row) byThread.set(`${msg.accountId}/${msg.threadId}`, { msg, count: 1, unread: msg.unread })
      else {
        row.count += 1
        row.unread = row.unread || msg.unread
      }
    }
    return Array.from(byThread.values())
  }, [scope, query, smart, now, threaded, liveOn])

  // The row's newest message changes when a reply arrives; the conversation stays selected.
  const selectedRow = useMemo(() => {
    const exact = rows.find((r) => r.msg.id === selectedId)
    if (exact || !selectedId || !threaded) return exact
    const was = messages.find((m) => m.id === selectedId)
    return was ? rows.find((r) => r.msg.accountId === was.accountId && r.msg.threadId === was.threadId) : undefined
  }, [rows, selectedId, threaded, messages])
  const pickedRows = useMemo(() => picked.filter((id) => rows.some((r) => r.msg.id === id)), [picked, rows])
  const multi = pickedRows.length > 1
  const thread = useMemo<Message[]>(() => {
    if (!selectedRow) return []
    if (!threaded) return [selectedRow.msg]
    return messages
      .filter((m) => m.threadId === selectedRow.msg.threadId && m.accountId === selectedRow.msg.accountId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedRow, threaded, messages])

  const totalUnread = useMemo(() => (realMode ? Object.values(inboxUnread).reduce((s, n) => s + n, 0) : messages.filter((m) => m.unread && m.folder === 'inbox').length), [messages, realMode, inboxUnread])
  // Only a real inbox (or the #demo sample) counts: on the sign-in screen the sample mail must not put a number on the tab or taskbar.
  const badgeCount = realMode || entered ? totalUnread : 0
  useEffect(() => platform.setBadge(badgeCount), [badgeCount])

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      setPicked([])
      anchorId.current = id
      setView('read')
      const row = rows.find((r) => r.msg.id === id)
      if (row && realMode) {
        void loadThread(row.msg)
        // Opening a conversation reads it, in Gmail as well.
        const unread = messages.filter((m) => m.unread && (threaded ? m.threadId === row.msg.threadId : m.id === id) && m.accountId === row.msg.accountId)
        if (unread.length > 0) {
          const before = unread.map((m) => ({ ...m }))
          const set = new Set(unread.map((m) => m.id))
          touch([...set])
          setMessages((prev) => prev.map((m) => (set.has(m.id) ? { ...m, unread: false } : m)))
          const acc = row.msg.accountId
          const call = threaded ? modifyThread(acc, row.msg.threadId, [], ['UNREAD']) : modifyMessages(acc, [gid(row.msg)], [], ['UNREAD'])
          void call.catch(() => setMessages((prev) => prev.map((m) => before.find((b) => b.id === m.id) ?? m)))
        }
      } else if (row) {
        const ids = messages.filter((m) => m.unread && (threaded ? m.threadId === row.msg.threadId : m.id === id) && m.accountId === row.msg.accountId).map((m) => m.id)
        if (ids.length > 0) patch(ids, { unread: false }, false)
      }
    },
    [rows, messages, threaded, patch, realMode, loadThread, touch],
  )

  // A clicked alert waits until its Inbox is on screen, then opens the message like a click on its row (loads it, marks it read).
  useEffect(() => {
    const id = openFromAlert.current
    if (!id) return
    const target = messages.find((m) => m.id === id)
    const row = rows.find((r) => r.msg.id === id || (target && r.msg.accountId === target.accountId && r.msg.threadId === target.threadId))
    if (!row) return
    openFromAlert.current = null
    select(row.msg.id)
  }, [alertTick, rows, messages, select])

  const openCompose = useCallback(
    (init?: Partial<ComposeInit>) => {
      setComposeKey((k) => k + 1)
      setCompose({ accountId, to: '', cc: '', bcc: '', subject: '', body: '', attachments: [], ...init })
    },
    [accountId],
  )

  const [when, setWhen] = useState<{ mode: WhenMode; rowIds: string[] } | null>(null)
  const [undoDelay, setUndoDelay] = usePersisted<string>('pm.undosend', '10', (v) => ['0', '5', '10', '20', '30'].includes(v))
  const [pendingSend, setPendingSend] = useState<{ d: ComposeInit; id: string } | null>(null)
  const sendTimer = useRef<number | undefined>(undefined)
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

  /** Everything the composer holds, as the raw email Gmail sends. */
  const outgoing = async (d: ComposeInit, acc: AuthAccount, lenient = false, messageId?: string): Promise<string> => {
    const files: OutAttachment[] = []
    let total = 0
    for (const at of d.attachments) {
      let bytes: Uint8Array
      if (at.file instanceof File) bytes = new Uint8Array(await at.file.arrayBuffer())
      else if (at.source) {
        await ensureBytes(at)
        bytes = mockBytes(at)
      } else if (lenient) continue
      else throw new Error(`reattach:${at.name}`)
      total += bytes.length
      files.push({ name: at.name, mime: at.mime, bytes })
    }
    if (total > 25 * 1024 * 1024) throw new Error('toolarge')
    const inlineOut = extractInlineImages(outgoingHtml(d.body))
    return toRaw(
      buildMime({
        from: { name: acc.name, email: acc.email },
        to: parseRecipients(d.to),
        cc: parseRecipients(d.cc),
        bcc: parseRecipients(d.bcc),
        subject: d.subject.trim() || '(no subject)',
        html: inlineOut.html,
        inline: inlineOut.images,
        text: htmlToPlain(d.body, true),
        attachments: files,
        inReplyTo: d.reply?.messageId || undefined,
        references: d.reply?.references || undefined,
        messageId,
      }),
    )
  }
  const sendError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('reattach:')) return `Please attach “${msg.slice(9)}” again, then send.`
    if (msg === 'toolarge') return 'The attachments are over Gmail\'s 25 MB limit.'
    return 'Gmail could not send the message.'
  }

  const sendReal = async (d: ComposeInit) => {
    const acc = realAccountsRef.current.find((x) => x.id === d.accountId)
    if (!acc) throw new Error('no account')
    // A proper Message-ID: unique, and ending in the sender's own domain (mail systems such as Outlook / Microsoft 365 distrust one without a real domain).
    const mid = `pm-${crypto.randomUUID()}@${acc.email.split('@')[1] ?? 'pivotmail.com'}`
    const raw = await outgoing(d, acc, false, mid)
    let sent: { id: string; threadId: string }
    try {
      sent = await sendRaw(acc.id, raw, d.reply?.threadId)
    } catch (e) {
      // The connection dropped or Gmail hiccuped: the message may be sent already. Look before anyone repeats it.
      const maybe = !(e instanceof GmailError) || e.status >= 500
      const found = maybe ? await findSentByMessageId(acc.id, mid) : null
      if (!found) throw e
      sent = found
    }
    if (d.gmailDraftId) void deleteDraft(acc.id, d.gmailDraftId).catch(() => undefined)
    mergeIn([fromCompose(d, `${acc.id}:${sent.id}`, 'sent', { threadId: sent.threadId, loaded: true })])
    lastSynced.current.delete(`${acc.id}/folder/sent`)
  }

  /** Keep what was typed as a Gmail draft (created the first time, updated after that). */
  const saveDraftReal = async (d: ComposeInit, oldId?: string) => {
    const acc = realAccountsRef.current.find((x) => x.id === d.accountId)
    if (!acc) return
    try {
      const raw = await outgoing(d, acc, true)
      const saved = d.gmailDraftId ? await updateDraft(acc.id, d.gmailDraftId, raw, d.reply?.threadId) : await createDraft(acc.id, raw, d.reply?.threadId)
      setMessages((prev) => prev.filter((x) => x.id !== oldId))
      mergeIn([fromCompose(d, `${acc.id}:${saved.message.id}`, 'drafts', { threadId: saved.message.threadId, loaded: true, gmailDraftId: saved.id })])
      showToast('Draft saved in Gmail')
    } catch {
      showToast('Could not save the draft to Gmail.')
    }
  }

  const finishSend = (d: ComposeInit, id: string) => {
    setPendingSend((p) => (p?.id === id ? null : p))
    if (realMode) {
      void sendReal(d).then(
        () => showToast('Message sent'),
        (e) => {
          // Nothing is lost: the message opens again exactly as it was.
          showToast(`${sendError(e)} Your message is open again.`)
          openCompose({ ...d, draftId: d.draftId ?? `u-${stamp()}` })
        },
      )
      return
    }
    upsert(fromCompose(d, id, 'sent'))
    showToast('Message sent')
  }
  const finishRef = useRef(finishSend)
  useEffect(() => {
    finishRef.current = finishSend
  })

  /** Send: held for the undo delay (Settings), then it moves to Sent. */
  const sendWithUndo = (d: ComposeInit) => {
    if (pendingSend) {
      window.clearTimeout(sendTimer.current)
      finishSend(pendingSend.d, pendingSend.id)
    }
    if (d.draftId) setMessages((prev) => prev.filter((x) => x.id !== d.draftId))
    setCompose(null)
    const delay = Number(undoDelay)
    const id = `s-${stamp()}`
    if (delay === 0) {
      if (realMode) finishSend(d, id)
      else {
        upsert(fromCompose(d, id, 'sent'))
        showToast('Message sent (mock)')
      }
      return
    }
    setPendingSend({ d, id })
    sendTimer.current = window.setTimeout(() => finishRef.current(d, id), delay * 1000)
  }
  const undoSend = () => {
    if (!pendingSend) return
    window.clearTimeout(sendTimer.current)
    const { d } = pendingSend
    setPendingSend(null)
    openCompose({ ...d, draftId: d.draftId ?? `u-${stamp()}` })
    showToast('Sending cancelled. Your message is open again.')
  }
  const scheduleSend = (d: ComposeInit, iso: string) => {
    if (d.draftId) setMessages((prev) => prev.filter((x) => x.id !== d.draftId))
    upsert(fromCompose(d, `q-${stamp()}`, 'scheduled', { sendAt: iso }))
    setCompose(null)
    showToast(`Scheduled for ${fmtWhen(iso)}`)
  }

  // Scheduled mail is sent and snoozed mail comes back when its time arrives.
  useEffect(() => {
    const tick = () => {
      const n = stamp()
      const due = messagesRef.current.filter((m) => (m.folder === 'scheduled' && m.sendAt && Date.parse(m.sendAt) <= n) || (m.folder === 'snoozed' && m.snoozedUntil && Date.parse(m.snoozedUntil) <= n))
      if (due.length === 0) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.folder === 'scheduled' && m.sendAt && Date.parse(m.sendAt) <= n) return { ...m, folder: 'sent', date: m.sendAt, sendAt: undefined }
          if (m.folder === 'snoozed' && m.snoozedUntil && Date.parse(m.snoozedUntil) <= n) return { ...m, folder: 'inbox', unread: true, snoozedUntil: undefined }
          return m
        }),
      )
      const back = due.filter((m) => m.folder === 'snoozed').length
      if (back > 0) showToast(`${back} snoozed message${back === 1 ? '' : 's'} back in the Inbox`)
    }
    const t = window.setInterval(tick, 15_000)
    return () => window.clearInterval(t)
  }, [showToast])

  /** Reopen a draft in the composer. */
  /** A Gmail draft: fetch the whole message and find its draft id, then edit it where it is. */
  const openDraftReal = async (m: Message) => {
    const msgs = await loadThread(m)
    const full = msgs.find((x) => x.id === m.id) ?? m
    let draftId = full.gmailDraftId
    if (!draftId) {
      try {
        draftId = (await listDrafts(m.accountId)).find((d) => d.message.id === gid(m))?.id
      } catch {
        draftId = undefined
      }
    }
    if (!draftId) {
      showToast('Could not open this draft for editing.')
      return
    }
    openCompose({
      accountId: m.accountId,
      to: full.to.map((p) => `${p.name} <${p.email}>`).join(', '),
      cc: (full.cc ?? []).map((p) => `${p.name} <${p.email}>`).join(', '),
      subject: full.subject === '(no subject)' ? '' : full.subject,
      body: full.html ?? textToHtml(full.body),
      attachments: full.attachments,
      draftId: m.id,
      gmailDraftId: draftId,
    })
  }
  const openDraft = (m: Message) =>
    realMode ? void openDraftReal(m) : openCompose({
      accountId: m.accountId,
      to: m.to.map((p) => `${p.name} <${p.email}>`).join(', '),
      cc: (m.cc ?? []).map((p) => `${p.name} <${p.email}>`).join(', '),
      subject: m.subject === '(no subject)' ? '' : m.subject,
      body: m.html ?? textToHtml(m.body),
      attachments: m.attachments,
      draftId: m.id,
    })

  const [perf, setPerf] = useState<{ status: 'loading' | 'error' | 'ready'; data?: { staff: StaffMember[]; days: Map<string, DayStat[]> } }>({ status: 'loading' })
  const openPerformance = () => {
    setScreen('performance')
    if (!authUser) return
    setPerf({ status: 'loading' })
    void fetchPerformance().then((data) => setPerf(data ? { status: 'ready', data } : { status: 'error' }))
  }
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
    if (ids.length === 0 && !(realMode && sel.kind !== 'label' && (sel.kind === 'all' || (sel.kind === 'folder' && sel.id === 'inbox')))) return
    if (realMode) {
      const before = scope.filter((m) => m.unread).map((m) => ({ ...m }))
      const set = new Set(ids)
      touch(ids)
      setMessages((prev) => prev.map((m) => (set.has(m.id) ? { ...m, unread: false } : m)))
      // The Inbox: Gmail may hold more unread mail than this device has loaded, so ask Gmail for all of it (up to 2,000 a mailbox).
      const wholeInbox = sel.kind === 'all' || (sel.kind === 'folder' && sel.id === 'inbox')
      const accountsAll = [...new Set(before.map((m) => m.accountId))]
      const inboxAccounts = wholeInbox ? (sel.kind === 'all' ? realAccountsRef.current.filter((x) => x.status !== 'needs_reconnect').map((x) => x.id) : [sel.accountId]) : []
      const accounts = [...new Set([...accountsAll, ...inboxAccounts])]
      const extra = new Map<string, string[]>()
      const gather = async () => {
        for (const acc of inboxAccounts) {
          const found: string[] = []
          let token: string | undefined
          do {
            const page = await listMessageIds(acc, { labelIds: ['INBOX', 'UNREAD'], pageToken: token, max: 500 })
            found.push(...page.ids.map((x) => x.id))
            token = page.next
          } while (token && found.length < 2000)
          extra.set(acc, found)
        }
      }
      const gidsFor = (acc: string): string[] => [...new Set([...before.filter((m) => m.accountId === acc).map(gid), ...(extra.get(acc) ?? [])])]
      const call = (add: string[], remove: string[]) => Promise.all(accounts.map((acc) => modifyMessages(acc, gidsFor(acc), add, remove)))
      void gather()
        .then(() => call([], ['UNREAD']))
        .then(
          () => {
            const total = accounts.reduce((n, acc) => n + gidsFor(acc).length, 0)
            realUndo.current.push({ before, inverse: async () => void (await call(['UNREAD'], [])) })
            inboxUnreadStale.current = true
            void pollRef.current()
            showToast(`${total} message${total === 1 ? '' : 's'} marked as read. Ctrl+Z to undo.`)
          },
          () => {
            restoreLocal(before)
            showToast('Gmail did not accept the change, so it was put back.')
          },
        )
      return
    }
    patch(ids, { unread: false })
    showToast(`${ids.length} message${ids.length === 1 ? '' : 's'} marked as read. Ctrl+Z to undo.`)
  }
  const emptyDeleted = () => {
    if (realMode) {
      setConfirmEmpty(false)
      showToast('Gmail empties Deleted Items by itself after 30 days. Permanent deletion from here is not available.')
      return
    }
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

  const sm = selectedRow?.msg
  const readerBanner: { text: string; actions: { label: string; onClick: () => void }[] } | undefined = !sm
    ? undefined
    : sm.folder === 'scheduled' && sm.sendAt
      ? {
          text: `Scheduled to send ${fmtWhen(sm.sendAt)}`,
          actions: [
            { label: 'Edit', onClick: () => openDraft(sm) },
            { label: 'Cancel send', onClick: () => patch([sm.id], { folder: 'drafts', sendAt: undefined }) },
          ],
        }
      : sm.folder === 'snoozed' && sm.snoozedUntil
        ? { text: `Snoozed until ${fmtWhen(sm.snoozedUntil)}`, actions: [{ label: 'Unsnooze', onClick: () => patch([sm.id], { folder: 'inbox', snoozedUntil: undefined }) }] }
        : sm.flagged && sm.dueAt
          ? { text: `Follow up ${fmtWhen(sm.dueAt)}`, actions: [{ label: 'Mark complete', onClick: () => patch([sm.id], { flagged: false, dueAt: undefined }) }] }
          : undefined

  /** Open a case on the server (generated or registered number); the sidebar updates at once. */
  const createCase = async (c: NewCase): Promise<{ ok: true; ref: string; subject: string | null } | { ok: false; message: string }> => {
    const r = await openCase(c)
    if (!r.ok) {
      // Pivot OS's own sentence (for example "Client name is required") is shown as it is.
      if (r.error === 'os' && r.message) return { ok: false, message: r.message }
      if (r.error === 'unavailable' && r.ref) return { ok: false, message: `Pivot OS issued ${r.ref}, but it could not be saved here. Use “I already have a number” with ${r.ref}.` }
      return { ok: false, message: CASE_ERRORS[r.error] ?? CASE_ERRORS.unavailable ?? 'Could not open the case.' }
    }
    setCasesDb((list) => [r.data.case, ...(list ?? []).filter((x) => x.ref !== r.data.case.ref)])
    return { ok: true, ref: r.data.case.ref, subject: r.data.subject }
  }
  const saveCase = async (ref: string, change: { notes?: string; status?: 'open' | 'closed' }): Promise<boolean> => {
    const r = await updateCase(ref, change)
    if (r.ok) setCasesDb((list) => (list ?? []).map((x) => (x.ref === ref ? r.data.case : x)))
    return r.ok
  }
  // When linked, ask Pivot OS about the reference numbers in the open conversation (once per number per visit).
  const threadRefs = useMemo(() => [...new Set(thread.flatMap((m) => m.subject.match(/\bP[ST]\d{7}\b/g) ?? []))].slice(0, 10), [thread])
  const askedFacts = useRef(new Set<string>())
  useEffect(() => {
    if (!osLinked) return
    const todo = threadRefs.filter((r) => !askedFacts.current.has(r))
    if (todo.length === 0) return
    todo.forEach((r) => askedFacts.current.add(r))
    void fetchOsFacts(todo).then((rows) => {
      if (rows.length > 0) setOsFacts((p) => ({ ...p, ...Object.fromEntries(rows.map((x) => [x.ref, x])) }))
    })
  }, [osLinked, threadRefs])
  // When linked, ask Pivot OS who the client is for the job numbers in the visible list (once per number, 20 at a time).
  const listRefs = useMemo(() => [...new Set(rows.slice(0, 60).flatMap((r) => r.msg.subject.match(/\bP[ST]\d{7}\b/g) ?? []))], [rows])
  useEffect(() => {
    if (!osLinked) return
    const todo = listRefs.filter((r) => !askedFacts.current.has(r))
    for (let i = 0; i < todo.length; i += 20) {
      const part = todo.slice(i, i + 20)
      part.forEach((r) => askedFacts.current.add(r))
      void fetchOsFacts(part).then((found) => {
        if (found.length > 0) setOsFacts((p) => ({ ...p, ...Object.fromEntries(found.map((x) => [x.ref, x])) }))
      })
    }
  }, [osLinked, listRefs])
  const selCase = realMode && sel.kind === 'case' ? casesDb?.find((c) => c.ref === sel.id) : undefined

  const sentLabel = (m: Message): string => {
    const d = new Date(m.date)
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  /** Puts the pictures that belong inside a message (cid:) into its HTML so they survive in a reply or forward. */
  const withPictures = (html: string, pictures?: Record<string, string>): string =>
    pictures ? html.replace(/(\ssrc\s*=\s*["']?)cid:([^"'\s>]+)/gi, (all, pre: string, cid: string) => (pictures[cid.toLowerCase()] ? `${pre}${pictures[cid.toLowerCase()]}` : all)) : html
  /** The quote with its inline pictures, waiting a few seconds at most for them. */
  const quoteFull = async (m: Message): Promise<string> => {
    const items = Object.entries(m.inline ?? {})
    if (!m.html || m.loaded === false || items.length === 0) return quote(m)
    const fetched = Promise.all(items.map(async ([cid, img]) => [cid, await inlineImageUri(img)] as const))
    const got = await Promise.race([fetched, new Promise<null>((res) => window.setTimeout(() => res(null), 4000))])
    const pictures = got ? Object.fromEntries(got.filter((x): x is readonly [string, string] => x[1] !== null)) : undefined
    return quote(m, pictures)
  }
  /** Outlook-style quoted message: a rule, a From/Sent/To/Cc/Subject block, then the original text. No side bar. */
  const quote = (m: Message, pictures?: Record<string, string>): string => {
    const who = (p: Person): string => `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;`
    const cc = m.cc && m.cc.length > 0 ? `<br><b>Cc:</b> ${m.cc.map(who).join('; ')}` : ''
    return `<div data-quote="1"><hr><div><b>From:</b> ${who(m.from)}<br><b>Sent:</b> ${escapeHtml(sentLabel(m))}<br><b>To:</b> ${m.to.map(who).join('; ')}${cc}<br><b>Subject:</b> ${escapeHtml(m.subject)}</div><br><div>${m.html && m.loaded !== false ? sanitizeEmailHtml(withPictures(m.html, pictures), true).html : textToHtml(m.body)}</div></div>`
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
    const html = `<div data-pm-email="1">${msgs.map((x) => quote(x)).join('')}</div>`
    const text = msgs.map(plainEmail).join('\n________________________________\n')
    rememberCopiedEmail(text, html)
    const ok = await platform.copyRich(html, text)
    showToast(ok ? 'Email copied. Paste it into a message with Ctrl+V.' : 'Copy was blocked by the browser')
  }
  const last = thread[thread.length - 1]
  /** Reply to a specific message (default: the last one in the open conversation). Replying to your own message writes to its recipients. */
  const reply = async (all: boolean, target?: Message) => {
    const t = target ?? last
    if (!t) return
    const acc = accountList.find((a) => a.id === t.accountId)
    const mine = t.from.email === acc?.email
    // A reply goes where the sender asked (Reply-To: contact forms, notification systems), otherwise to the sender.
    const toList = mine && t.to.length > 0 ? t.to : t.replyTo && t.replyTo.length > 0 ? t.replyTo : [t.from]
    const taken = new Set([acc?.email, ...toList.map((p) => p.email)])
    const cc = all
      ? [...t.to, ...(t.cc ?? [])]
          .map((p) => p.email)
          .filter((e) => {
            if (taken.has(e)) return false
            taken.add(e)
            return true
          })
          .join(', ')
      : ''
    const body = await quoteFull(t)
    openCompose({
      accountId: t.accountId,
      to: toList.map((p) => p.email).join(', '),
      cc,
      subject: /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`,
      body,
      reply: realMode && t.rfcId ? { threadId: t.threadId, messageId: t.rfcId, references: [t.rfcRefs, t.rfcId].filter(Boolean).join(' ') } : undefined,
    })
  }
  const forward = async (target?: Message) => {
    const t = target ?? last
    if (!t) return
    const body = await quoteFull(t)
    openCompose({ accountId: t.accountId, subject: /^fwd?:/i.test(t.subject) ? t.subject : `Fwd: ${t.subject}`, body, attachments: t.attachments })
  }

  const retry = () => {
    if (retrying) return
    if (realMode) {
      setRetrying(true)
      void syncTarget(sel, true).finally(() => setRetrying(false))
      return
    }
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
    if (realMode) {
      void Promise.allSettled([syncTarget(sel, true), pollAll()]).then(() => showToast('Synced'))
      return
    }
    setSyncing(true)
    window.setTimeout(() => {
      setSyncing(false)
      setLastSync(new Date())
      showToast('Synced')
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
    | { kind: 'snooze'; until: string }
    | { kind: 'followup'; due: string | null }

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
  /** One entry per real change, so Ctrl+Z can take it back in Gmail as well as on screen. */
  const realUndo = useRef<{ before: Message[]; inverse: () => Promise<void> }[]>([])

  const restoreLocal = (before: Message[]) => {
    const byId = new Map(before.map((m) => [m.id, m]))
    setMessages((prev) => prev.map((m) => byId.get(m.id) ?? m))
  }

  /** Changes to real mail: shown at once, sent to Gmail, and put back (with a message) if Gmail refuses. */
  const runReal = async (rowIds: string[], op: BulkOp) => {
    if (!online) return showToast('You are offline, so this cannot be done yet. Try again when you are back online.')
    const mids = rowsToMids(rowIds)
    const group = messages.filter((m) => mids.includes(m.id))
    if (group.length === 0) return
    touch(mids)
    const many = rowIds.length > 1 ? ` (${rowIds.length} conversations)` : ''
    const threads = threadsOf(group)
    const leave = (label: string) => {
      if (selectedId && rowIds.includes(selectedId)) {
        const next = nextRowAfter(rowIds)
        setSelectedId(next ? next.msg.id : null)
        if (!next) setView('list')
      }
      setPicked([])
      showToast(`${label}${many} · ${MOD}+Z to undo`)
    }
    const ids = new Set(mids)
    const patchLocal = (f: (m: Message) => Partial<Message>) => setMessages((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, ...f(m) } : m)))
    const newest = new Set(threads.map((t) => `${t.accountId}:${t.newestGid}`))
    const byAccount = (fn: (accountId: string, ts: typeof threads) => Promise<unknown>) => Promise.all([...new Set(threads.map((t) => t.accountId))].map((acc) => fn(acc, threads.filter((t) => t.accountId === acc))))

    let label = ''
    let remote: () => Promise<unknown>
    let inverse: () => Promise<void>
    let finish = () => showToast(`${label}${many} · ${MOD}+Z to undo`)

    switch (op.kind) {
      case 'delete':
      case 'archive':
      case 'move': {
        if (op.kind === 'move' && op.target.kind === 'label') {
          const tid = labelsRef.current[op.target.accountId]?.find((l) => l.name === (op.target as { id: string }).id)?.id
          if (!tid) return showToast('That folder is not a Gmail label.')
          label = `Added to ${op.target.id}`
          patchLocal((m) => ({ labels: m.labels.includes((op.target as { id: string }).id) ? m.labels : [...m.labels, (op.target as { id: string }).id] }))
          remote = () => forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, [tid], []))
          inverse = async () => void (await forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, [], [tid])))
          finish = () => showToast(`${label}${many}`)
          break
        }
        const to: FolderId = op.kind === 'delete' ? 'deleted' : op.kind === 'archive' ? 'archive' : op.target.kind === 'folder' ? op.target.id : 'inbox'
        if (to !== 'inbox' && to !== 'archive' && to !== 'deleted') return showToast('Mail can only be moved to Inbox, Archive, Deleted Items or a label.')
        if (op.kind === 'archive' && threads.some((t) => t.folder === 'sent' || t.folder === 'drafts')) return showToast('Only mail that is in the Inbox (or Deleted Items) can be archived. Sent mail and drafts stay where they are.')
        if (threads.every((t) => t.folder === to)) return
        label = to === 'deleted' ? 'Moved to Deleted Items' : to === 'archive' ? 'Archived' : 'Moved to Inbox'
        patchLocal(() => ({ folder: to }))
        remote = () => forThreads(threads, (t) => moveThread(t.accountId, t.threadId, t.folder, to))
        inverse = async () => void (await forThreads(threads, (t) => moveThread(t.accountId, t.threadId, to, t.folder)))
        finish = () => leave(label)
        break
      }
      case 'toggleRead':
      case 'read': {
        const markRead = op.kind === 'toggleRead' ? group.some((m) => m.unread) : op.read
        if (markRead) {
          const wasUnread = group.filter((m) => m.unread).map((m) => m.id)
          label = 'Marked as read'
          patchLocal(() => ({ unread: false }))
          remote = () => forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, [], ['UNREAD']))
          inverse = async () => void (await byAccount((acc) => labelsOn(acc, wasUnread.filter((i) => i.startsWith(`${acc}:`)).map((i) => i.slice(acc.length + 1)), ['UNREAD'], [])))
        } else {
          label = 'Marked as unread'
          patchLocal((m) => (newest.has(m.id) ? { unread: true } : {}))
          remote = () => byAccount((acc, ts) => labelsOn(acc, ts.map((t) => t.newestGid), ['UNREAD'], []))
          inverse = async () => void (await byAccount((acc, ts) => labelsOn(acc, ts.map((t) => t.newestGid), [], ['UNREAD'])))
        }
        finish = () => undefined
        break
      }
      case 'toggleFlag': {
        const unflag = group.every((m) => m.flagged)
        if (unflag) {
          const was = group.filter((m) => m.flagged).map((m) => m.id)
          label = 'Flag removed'
          patchLocal(() => ({ flagged: false, dueAt: undefined }))
          remote = () => forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, [], ['STARRED']))
          inverse = async () => void (await byAccount((acc) => labelsOn(acc, was.filter((i) => i.startsWith(`${acc}:`)).map((i) => i.slice(acc.length + 1)), ['STARRED'], [])))
        } else {
          label = 'Flagged'
          patchLocal((m) => (newest.has(m.id) ? { flagged: true } : {}))
          remote = () => byAccount((acc, ts) => labelsOn(acc, ts.map((t) => t.newestGid), ['STARRED'], []))
          inverse = async () => void (await byAccount((acc, ts) => labelsOn(acc, ts.map((t) => t.newestGid), [], ['STARRED'])))
        }
        finish = () => undefined
        break
      }
      case 'toggleImportant': {
        const remove = group.every((m) => m.important)
        label = remove ? 'Importance removed' : 'Marked important'
        patchLocal(() => ({ important: !remove }))
        remote = () => forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, remove ? [] : ['IMPORTANT'], remove ? ['IMPORTANT'] : []))
        inverse = async () => void (await forThreads(threads, (t) => modifyThread(t.accountId, t.threadId, remove ? ['IMPORTANT'] : [], remove ? [] : ['IMPORTANT'])))
        finish = () => undefined
        break
      }
      default:
        showToast('Colour categories, snooze and follow-up dates are not available for Gmail mail yet.')
        return
    }

    const before = group.map((m) => ({ ...m }))
    try {
      await remote()
      realUndo.current.push({ before, inverse })
      if (realUndo.current.length > 30) realUndo.current.shift()
      finish()
    } catch (e) {
      restoreLocal(before)
      if (e instanceof GmailError && e.status === SESSION_ENDED) setSim('expired')
      else showToast('Gmail did not accept the change, so it was put back. Please try again.')
    }
  }

  const runOp = (rowIds: string[], op: BulkOp) => {
    if (realMode) {
      void runReal(rowIds, op)
      return
    }
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
        patch(mids, group.every((m) => m.flagged) ? { flagged: false, dueAt: undefined } : { flagged: true })
        break
      case 'snooze':
        patch(mids, { folder: 'snoozed', snoozedUntil: op.until })
        leave(`Snoozed until ${fmtWhen(op.until)}`)
        break
      case 'followup':
        patch(mids, { flagged: true, dueAt: op.due ?? undefined })
        showToast(op.due ? `Follow up ${fmtWhen(op.due)}${many}` : `Flagged${many}`)
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
  // "Mark as read" on a Windows alert does exactly what marking it read in the list does.
  useEffect(() => {
    alertRead.current = (id) => runOp([id], { kind: 'read', read: true })
  })

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
        { type: 'item', label: 'Reply', icon: 'reply', tone: 'blue', onSelect: () => reply(false, m) },
        { type: 'item', label: 'Reply all', icon: 'replyAll', tone: 'blue', onSelect: () => reply(true, m) },
        { type: 'item', label: 'Forward', icon: 'forward', tone: 'blue', onSelect: () => forward(m) },
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
      { type: 'item', label: 'Follow up…', icon: 'flag', tone: 'orange', onSelect: () => setWhen({ mode: 'followup', rowIds }), disabled: realMode },
      { type: 'item', label: 'Snooze…', icon: 'clock', tone: 'orange', onSelect: () => setWhen({ mode: 'snooze', rowIds }), disabled: realMode || m.folder === 'drafts' || m.folder === 'sent' || m.folder === 'scheduled' },
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
      if (!(entered || authUser) || screen !== 'mail') return
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select') || t.isContentEditable
      const mod = e.ctrlKey || e.metaKey
      const k = e.key
      const lk = k.length === 1 ? k.toLowerCase() : k
      if (help || jump || refOpen || ctx) return // dialogs and menus own the keyboard

      // ---- global: work even while typing ----
      if (mod && !e.altKey && !e.shiftKey && (lk === 'f' || lk === 'e' || (lk === 'k' && !compose))) {
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
      if (mod && !e.altKey && !e.shiftKey && (lk === 'y' || lk === 'g') && (!typing || t.closest('.tb-search'))) {
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
      const idx = rows.findIndex((r) => r.msg.id === (selectedRow?.msg.id ?? selectedId))
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
      } else if ((k === 'ContextMenu' || (e.shiftKey && k === 'F10')) && selectedRow && !typing) {
        e.preventDefault()
        const el = document.querySelector<HTMLElement>('.row.sel')
        const r = el?.getBoundingClientRect()
        setCtx({ id: selectedRow.msg.id, x: (r?.left ?? 240) + 48, y: (r?.bottom ?? 200) - 8 })
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

  const title = sel.kind === 'folder' ? (FOLDER_TITLES[sel.id] ?? sel.id) : sel.kind === 'case' ? `Case ${sel.id}` : sel.kind === 'all' ? 'All inboxes' : sel.id
  const showReader = pane !== 'off'

  // Windows app with nobody signed in: the app's own small sign-in window takes over (see the effect above); show only the splash.
  if ((!sessionChecked || (authUser && !accountsTried) || desktopSignedOut) && !entered)
    return (
      <div className="splash" role="status" aria-live="polite">
        <BrandLogo size="lg" />
        <p>{authUser ? 'Setting up your account' : 'Loading'}</p>
        <div className="splash-bar" aria-hidden="true"><span /></div>
      </div>
    )
  if (!entered && !authUser) return <SignIn config={authConfig} error={authError} />

  if (sim === 'expired' || sim === 'denied') {
    return (
      <StatusScreen
        kind={sim}
        account={accountList[0]?.email ?? ''}
        onAction={() => {
          setSim(null)
          // A real sign-in that has ended: back to the sign-in page (mail kept on this device is not touched).
          if (realMode && sim === 'expired') {
            setAuthUser(null)
            setRealAccounts(null)
            setMessages([])
          }
        }}
      />
    )
  }

  if (screen === 'settings') {
    return (
      <SettingsContext.Provider value={settingsValue}>
        <SettingsPage
          role={role}
          accounts={accounts}
          onSignatures={(id, list, newId, replyId) => setSigStore({ ...sigStore, [id]: { list, newId, replyId } })}
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
          signedIn={Boolean(authUser)}
          title={authUser ? (authUser.title ?? '') : undefined}
          onTitle={async (t) => {
            const saved = await saveTitle(t)
            if (saved === null) return false
            setAuthUser((u) => (u ? { ...u, title: saved } : u))
            return true
          }}
          city={city}
          onCity={setCity}
          undoDelay={undoDelay}
          onUndoDelay={setUndoDelay}
          onBack={() => setScreen('mail')}
          sim={sim}
          onSim={(p) => {
            setSim(p)
            if (p) setScreen('mail')
          }}
          onToast={showToast}
        />
        <Notices notices={notices} onDismiss={dismissNotice} />
      </SettingsContext.Provider>
    )
  }

  if (screen === 'performance') {
    return (
      <>
        <PerformancePage role={role} onBack={() => setScreen('mail')} onToast={showToast} data={authUser ? (perf.data ?? EMPTY_PERF) : undefined} status={authUser ? perf.status : 'ready'} />
        <Notices notices={notices} onDismiss={dismissNotice} />
      </>
    )
  }

  const gi = gmailInfo[accountId]
  const windowDays = realAccounts?.find((x) => x.id === accountId)?.syncWindowDays ?? 90
  const realEmpty =
    realAccounts && realAccounts.length === 0
      ? 'No mailbox connected yet. Choose Add account in the sidebar.'
      : syncing
        ? 'Loading your mail…'
        : sel.kind === 'case'
          ? `No email carries ${sel.id} yet. Put it in the subject and the email joins this case.`
        : realAccounts?.find((x) => x.id === accountId)?.status === 'needs_reconnect'
          ? 'This mailbox needs to be reconnected. Use the ⋯ menu next to its name.'
          : `Nothing here from the last ${windowDays} days.${gi && gi !== 'error' ? ` Search to look further back: Gmail holds ${gi.total.toLocaleString()} messages in total.` : ''}`
  const emptyText = realMode && (!query.trim() || syncing) ? realEmpty : query.trim() ? `No results for “${query.trim()}”` : smart.length > 0 ? 'No messages match these filters' : 'Nothing in this folder'

  /** Signed in, but no mailbox connected yet: the usual screen, with a welcome in place of the mail. */
  const noMailbox = Boolean(authUser) && accountsTried && realAccounts !== null && realAccounts.length === 0

  return (
    <SettingsContext.Provider value={settingsValue}>
    <>
    {!noMailbox && (
        <a className="skip-link" href="#message-list" onClick={(e) => { e.preventDefault(); document.getElementById('message-list')?.focus() }}>
      Skip to message list
    </a>
    )}
    <div
      className={`app${sim === 'offline' || !netOnline || sim === 'syncfail' || sim === 'ratelimit' ? ' has-banner' : ''}`}
      data-density={density}
      style={{ '--folders-w': panes.folders ? `${panes.folders}px` : undefined, '--list-w': panes.list ? `${panes.list}px` : undefined, '--list-h': panes.height ? `${panes.height}px` : undefined } as CSSProperties}
    >
      <Toolbar
        dark={theme === 'dark'}
        onDark={(v) => setTheme(v ? 'dark' : 'light')}
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
        refOpen={refOpen}
        onRef={(anchor) => {
          if (refOpen && anchor) setRefOpen(false)
          else {
            setRefAnchor(anchor ?? null)
            setRefOpen(true)
          }
        }}
        signedInAs={authUser?.email}
        canSwitchRole={!authUser || authUser.role === 'admin'}
        onSignOut={() => {
          if (authUser) void forgetPersonalData().then(() => signOut()).then(() => { setAuthUser(null); setAuthError(null); setMessages([]); setRealAccounts(null); restartClean() })
          setEntered(false)
        }}
        onSignOutAll={
          authUser
            ? () => {
                void forgetPersonalData().then(() => signOut(true)).then(() => { setAuthUser(null); setAuthError(null); setMessages([]); setRealAccounts(null); restartClean() })
                setEntered(false)
              }
            : undefined
        }
        role={role}
        onRole={setRole}
        onPerformance={openPerformance}
        onSettings={() => setScreen('settings')}
        onHelp={() => setHelp(true)}
        registerSearch={setSearchEl}
        weather={weather}
        subtitle={authUser?.title?.trim() || [authUser ? (role === 'admin' ? 'Administrator' : 'Staff') : 'Preview', authUser ? (authUser.company === 'tmc' ? 'Pivot Travel Management' : 'Pivot Shipping') : ''].filter(Boolean).join(' · ')}
        userName={authUser?.name?.trim() || (authUser ? authUser.email.split('@')[0] ?? '' : 'Staff')}
        history={noticeLog}
        unseen={noticeLog.filter((h) => h.id > seenLog).length}
        onSeen={() => setSeenLog(noticeLog[0]?.id ?? seenLog)}
        onClearHistory={() => setNoticeLog([])}
        foldersOpen={foldersOpen}
        onToggleFolders={() => setFoldersOpen(!foldersOpen)}
        bar={{
          enabled: Boolean(selectedRow) || multi,
          unread: multi ? messages.some((m) => rowsToMids(pickedRows).includes(m.id) && m.unread) : Boolean(selectedRow?.unread),
          flagged: multi ? messages.filter((m) => rowsToMids(pickedRows).includes(m.id)).every((m) => m.flagged) : Boolean(selectedRow?.msg.flagged),
          onReply: () => reply(false),
          onReplyAll: () => reply(true),
          onForward: () => forward(),
          onArchive: () => runOp(selRows(), { kind: 'archive' }),
          onDelete: () => runOp(selRows(), { kind: 'delete' }),
          onToggleRead: () => runOp(selRows(), { kind: 'toggleRead' }),
          onToggleFlag: () => runOp(selRows(), { kind: 'toggleFlag' }),
          onMove: () => setJump('move'),
          onMore: (x, y) => {
            const id = selectedRow?.msg.id ?? pickedRows[0]
            if (id) setCtx({ id, x, y })
          },
        }}
      />
      {(!online || sim === 'syncfail' || sim === 'ratelimit') && (
        <StatusBanner kind={!online ? 'offline' : sim === 'ratelimit' ? 'ratelimit' : 'syncfail'} real={realMode} detail={syncDetail} last={lastSync} seconds={wait} busy={retrying} onRetry={retry} />
      )}
      <main className="workspace" data-pane={pane} data-view={noMailbox ? 'welcome' : view} data-folders={foldersOpen ? "on" : "off"}>
        <FolderPane
          accounts={accountList}
          sample={!realMode}
          unreadOverride={realMode ? inboxUnread : undefined}
          onAddAccount={() => (realMode ? setConnectDlg('new') : setAccDlg({ mode: 'add' }))}
          onReconnect={(id) => {
            const x = realAccounts?.find((y) => y.id === id)
            if (x) setConnectDlg({ company: x.company, kind: x.kind })
          }}
          onRemoveAccount={(id) => {
            if (realMode) {
              const x = realAccounts?.find((y) => y.id === id)
              if (x) setConfirmRemove(x)
              return
            }
            const x = accountList.find((y) => y.id === id)
            if (x) setAccDlg({ mode: 'remove', id, name: x.name, email: x.email })
          }}
          messages={messages}
          selection={sel}
          folders={foldersView}
          cases={cases}
          caseNames={caseNames}
          onFolderAction={folderAction}
          onReorder={reorderFolder}
          onSelect={(s) => {
            setSel(s)
            setSelectedId(null)
            setView('list')
          }}
          onDropMessage={dropMessages}
        />
        {noMailbox && authUser ? (
          <Welcome
            name={authUser.name || authUser.email.split('@')[0] || ''}
            email={authUser.email}
            company={authUser.company === 'tmc' ? 'tmc' : 'scl'}
            onOther={() => setConnectDlg('new')}
          />
        ) : (
          <>
        <MessageList
          chips={queryChips}
          onRemoveChip={removeChip}
          allFolders={searchAll && query.trim() !== ''}
          rows={rows}
          selectedId={selectedRow?.msg.id ?? selectedId}
          density={density}
          smart={showSmart ? smart : []}
          smartCounts={smartCounts}
          showSmart={showSmart}
          onToggleSmart={toggleSmart}
          title={title}
          subtitle={sel.kind === 'all' ? `${accountList.length} mailboxes` : (accountList.find((a) => a.id === accountId)?.email ?? '')}
          accountNames={sel.kind === 'all' ? Object.fromEntries(accountList.map((x) => [x.id, x.name])) : undefined}
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
          sample={!realMode}
          actions={[
            ...(scope.some((m) => m.unread) ? [{ label: 'Mark all as read', onClick: markAllRead }] : []),
            ...(sel.kind === 'folder' && sel.id === 'deleted' && scope.length > 0 ? [{ label: 'Empty folder', onClick: () => setConfirmEmpty(true), danger: true }] : []),
          ]}
          error={sim === 'listerror' ? { onRetry: retry, busy: retrying } : undefined}
          sync={{ state: !online ? 'offline' : syncing ? 'syncing' : 'synced', last: lastSync }}
          refClient={(ref) => osFacts[ref]?.client ?? caseNames?.[ref]}
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
            placeholder={selCase ? <CasePanel key={selCase.ref} c={selCase} onSave={(ch) => saveCase(selCase.ref, ch)} onNewMail={(subject) => openCompose({ subject })} onToast={showToast} /> : undefined}
            onReply={() => reply(false)}
            onReplyAll={() => reply(true)}
            onForward={() => forward()}
            onReplyTo={reply}
            onForwardMsg={forward}
            onMoreMsg={(m, x, y) => setCtx({ id: m.id, x, y })}
            onBack={() => setView('list')}
            onToast={showToast}
            onForwardWith={(files: Attachment[]) => openCompose({ attachments: files })}
            onDelete={() => selectedRow && rowAction(selectedRow.msg.id, 'delete')}
            onFlag={() => selectedRow && rowAction(selectedRow.msg.id, 'flag')}
            onUnread={() => selectedRow && rowAction(selectedRow.msg.id, 'unread')}
            banner={readerBanner}
            onEditDraft={() => selectedRow && openDraft(selectedRow.msg)}
            onMore={(x, y) => selectedRow && setCtx({ id: selectedRow.msg.id, x, y })}
            onPrint={() => selectedRow && printThread(selectedRow.msg)}
            onPopout={() => selectedRow && popOut(selectedRow.msg)}
            details={
              <DetailsPanel
                open={detailsOpen}
                onToggle={() => setDetailsOpen(!detailsOpen)}
                thread={thread}
                cases={realMode ? (casesDb ?? []) : undefined}
                facts={osFacts}
                onOpenCase={(ref) => goTo({ accountId: (realMode ? accountList.find((x) => x.company === (ref.startsWith('PT') ? 'tmc' : 'scl'))?.id : undefined) ?? accountId, kind: 'case', id: ref })}
              />
            }
            flagged={Boolean(selectedRow?.msg.flagged)}
            unread={Boolean(selectedRow?.unread)}
          />
        )}
          </>
        )}
        {!noMailbox && foldersOpen && <PaneSplitter kind="folders" label="Resize the folder list" value={panes.folders ?? null} onChange={(v) => setPane1('folders', v)} />}
        {!noMailbox && pane === 'right' && <PaneSplitter kind="list" label="Resize the message list" value={panes.list ?? null} onChange={(v) => setPane1('list', v)} />}
        {!noMailbox && pane === 'bottom' && <PaneSplitter kind="height" label="Resize the message list height" value={panes.height ?? null} onChange={(v) => setPane1('height', v)} />}
      </main>
      {compose && (
        <Composer
          key={composeKey}
          init={compose}
          accounts={accounts}
          offline={!online}
          noSchedule={realMode}
          pendingTemplate={pendingTemplate}
          onTemplateUsed={() => setPendingTemplate(null)}
          onSend={(d, opts) => (opts?.sendAt ? scheduleSend(d, opts.sendAt) : sendWithUndo(d))}
          onClose={(draft, discarded) => {
            const id = compose?.draftId
            const gd = compose?.gmailDraftId
            if (realMode) {
              if (discarded) {
                if (id) setMessages((prev) => prev.filter((x) => x.id !== id))
                if (gd) void deleteDraft(compose?.accountId ?? '', gd).catch(() => undefined)
              } else if (draft) void saveDraftReal(draft, id)
            } else if (discarded && id) setMessages((prev) => prev.filter((x) => x.id !== id))
            else if (draft) upsert(fromCompose(draft, id ?? `d-${stamp()}`, 'drafts'))
            setCompose(null)
          }}
          onToast={showToast}
        />
      )}
      {/* The entries only read state; the ref the linter sees is the undo stack used inside the actions, called on click. */}
      {/* oxlint-disable-next-line react/refs */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} entries={ctxEntries()} onClose={() => setCtx(null)} />}
      {when && (
        <WhenDialog
          mode={when.mode}
          onClose={() => setWhen(null)}
          onPick={(iso) => {
            const ids = when.rowIds
            if (when.mode === 'snooze' && iso) runOp(ids, { kind: 'snooze', until: iso })
            else if (when.mode === 'followup') runOp(ids, { kind: 'followup', due: iso })
            setWhen(null)
          }}
        />
      )}
      {original && <OriginalDialog msg={original} onClose={() => setOriginal(null)} />}
      {confirmEmpty && (
        <ConfirmDialog title="Empty Deleted Items" confirm="Empty folder" danger onConfirm={emptyDeleted} onClose={() => setConfirmEmpty(false)}>
          Permanently delete {scope.length} message{scope.length === 1 ? '' : 's'} in {accountList.find((x) => x.id === accountId)?.name}? This cannot be undone.
        </ConfirmDialog>
      )}
      {connectDlg && <ConnectDialog isAdmin={role === 'admin'} initial={connectDlg === 'new' ? undefined : connectDlg} onClose={() => setConnectDlg(null)} />}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove account"
          confirm="Remove account"
          danger
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => {
            const x = confirmRemove
            setConfirmRemove(null)
            void disconnectAccount(x.id).then((ok) => {
              showToast(ok ? `${x.email} removed` : 'Could not remove the account. You may not have permission.')
              if (ok) {
                void platform.cache.clearAccount(x.id)
                setMessages((prev) => prev.filter((m) => m.accountId !== x.id))
              }
              void loadAccounts()
            })
          }}
        >
          Pivot Mail will stop using {confirmRemove.email} and forget its saved permission. Mail in Gmail is not touched. You can add it again at any time.
        </ConfirmDialog>
      )}
      {accDlg && <AccountDialog state={accDlg} existing={accountList.map((x) => x.email.toLowerCase())} onAdd={addAccount} onRemove={removeAccount} onClose={() => setAccDlg(null)} />}
      {folderDlg && (
        <FolderDialog
          state={folderDlg}
          accountName={accountList.find((x) => x.id === folderDlg.accountId)?.name ?? ''}
          existing={foldersView[folderDlg.accountId] ?? []}
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
          folders={foldersView}
          cases={cases}
          caseNames={caseNames}
          accountId={accountId}
          onClose={() => setJump(null)}
          onPick={(s) => {
            if (jump === 'move') {
              if (selRows().length > 0) dropMessages(selRows(), s)
            } else goTo(s)
          }}
        />
      )}
      {refOpen && (
        <RefGenerator
          anchor={refAnchor}
          onClose={() => setRefOpen(false)}
          onToast={showToast}
          onNewMail={(subject) => openCompose({ subject })}
          real={authUser ? { company: authUser.company === 'tmc' ? 'tmc' : 'scl', companies: caseCompanies.length > 0 ? caseCompanies : undefined, linked: osLinked, onCreate: createCase, picks: fetchPicks } : undefined}
        />
      )}
      <Notices notices={notices} onDismiss={dismissNotice} lead={
            pendingSend ? (
              <div className="status-card progress" role="status">
                <span className="status-card-icon" aria-hidden="true">
                  <span className="spinner" />
                </span>
                <span className="status-card-text">Sending…</span>
                <button type="button" className="status-card-action" onClick={undoSend}>
                  Undo
                </button>
              </div>
            ) : null
          } />
    </div>
    </>
    </SettingsContext.Provider>
  )
}
