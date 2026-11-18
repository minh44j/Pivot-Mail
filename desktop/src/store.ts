/**
 * The desktop app's local mail store (SQLite, built into Electron): every message the app has fetched, kept on this computer,
 * with a full-text index for instant search over subject, people, preview and body. It replaces the browser's small IndexedDB copy.
 *
 * Stored in the Windows profile folder (%APPDATA%\Pivot Mail\mail.db), like Outlook's own data file. Wiped on sign-out, when a
 * different person signs in on this computer, and per mailbox when that mailbox is removed (the web app asks for each of these).
 */
import { DatabaseSync } from 'node:sqlite'

/** The shape the web app stores (web/src/types.ts Message); only the fields the store reads are named here. */
interface Msg {
  id: string
  accountId: string
  date: string
  subject?: string
  snippet?: string
  body?: string
  from?: { name?: string; email?: string }
  to?: { name?: string; email?: string }[]
  cc?: { name?: string; email?: string }[]
  attachments?: { name?: string }[]
  loaded?: boolean
  [k: string]: unknown
}

/** The newest messages per mailbox handed to the window at start (the rest stays here and is reached through search). */
const LOAD_LIMIT = 5000
/** A message body longer than this is indexed only in its first part (keeps the index small and fast). */
const BODY_INDEX_CHARS = 20_000
/** Messages kept per mailbox on this computer; beyond it the oldest are dropped (they stay in Gmail and come back through search). */
export const KEEP_PER_ACCOUNT = 50_000
/** Fields a quick list refresh may change on a message whose full body is already stored. */
const LIGHT_FIELDS = ['folder', 'labels', 'unread', 'flagged', 'important', 'hasAttachments'] as const

export class MailStore {
  private db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, date TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_account_date ON messages (account_id, date DESC);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      -- The word index: one entry per message, sharing the message's row number (so replacing or removing one is a direct lookup).
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(subject, people, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
    `)
  }

  load(accountId: string, limit = LOAD_LIMIT): unknown[] {
    const rows = this.db.prepare('SELECT json FROM messages WHERE account_id = ? ORDER BY date DESC LIMIT ?').all(accountId, Math.min(Math.max(1, limit), 50_000)) as { json: string }[]
    return rows.map((r) => JSON.parse(r.json))
  }

  save(msgs: Msg[]): void {
    const old = this.db.prepare('SELECT json FROM messages WHERE id = ?')
    const put = this.db.prepare('INSERT INTO messages (id, account_id, date, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, date = excluded.date, json = excluded.json RETURNING rowid')
    const unindex = this.db.prepare('DELETE FROM search_index WHERE rowid = ?')
    const index = this.db.prepare('INSERT INTO search_index (rowid, subject, people, body) VALUES (?, ?, ?, ?)')
    this.db.exec('BEGIN')
    try {
      for (const m of msgs) {
        if (!m || typeof m.id !== 'string' || typeof m.accountId !== 'string' || typeof m.date !== 'string') continue
        // A list refresh sends messages without their body: keep the stored full copy and update only what can change.
        if (!m.loaded) {
          const prev = old.get(m.id) as { json: string } | undefined
          const full = prev ? (JSON.parse(prev.json) as Msg) : null
          if (full?.loaded) {
            for (const k of LIGHT_FIELDS) if (k in m) full[k] = m[k]
            put.run(full.id, full.accountId, full.date, JSON.stringify(full))
            continue
          }
        }
        const { rowid } = put.get(m.id, m.accountId, m.date, JSON.stringify(m)) as { rowid: number }
        unindex.run(rowid)
        const who = [m.from, ...(m.to ?? []), ...(m.cc ?? [])].filter(Boolean).map((p) => `${p?.name ?? ''} ${p?.email ?? ''}`)
        const files = (m.attachments ?? []).map((a) => a?.name ?? '')
        index.run(rowid, m.subject ?? '', who.join(' '), `${m.snippet ?? ''}\n${files.join(' ')}\n${(m.body ?? '').slice(0, BODY_INDEX_CHARS)}`)
      }
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    for (const a of new Set(msgs.map((m) => m?.accountId).filter((x): x is string => typeof x === 'string'))) this.prune(a)
  }

  /** Drops the oldest messages of a mailbox beyond KEEP_PER_ACCOUNT (checked cheaply; trimmed in steps of 1,000). */
  private prune(accountId: string, keep = KEEP_PER_ACCOUNT): void {
    if (this.count(accountId) <= keep + 1000) return
    const drop = this.db.prepare('SELECT id FROM messages WHERE account_id = ? ORDER BY date DESC LIMIT -1 OFFSET ?').all(accountId, keep) as { id: string }[]
    this.remove(drop.map((r) => r.id))
  }

  remove(ids: string[]): void {
    const del = this.db.prepare('DELETE FROM messages WHERE id = ? RETURNING rowid')
    const unindex = this.db.prepare('DELETE FROM search_index WHERE rowid = ?')
    this.db.exec('BEGIN')
    for (const id of ids) {
      const r = del.get(id) as { rowid: number } | undefined
      if (r) unindex.run(r.rowid)
    }
    this.db.exec('COMMIT')
  }

  /**
   * Instant search over everything stored. Plain words must all appear (in any field, as word beginnings: "invo" finds "invoice");
   * Gmail-style operators such as from: or has:attachment are left to Gmail's own search, which runs right after.
   */
  search(accountIds: string[], query: string, limit = 300): unknown[] {
    const words = query
      .split(/\s+/)
      .filter((w) => w && !/^-?[a-z]+:/i.test(w))
      .map((w) => w.replace(/["*^():]/g, '').trim())
      .filter((w) => w.length > 0)
      .slice(0, 12)
    if (words.length === 0 || accountIds.length === 0) return []
    const match = words.map((w) => `"${w}"*`).join(' AND ')
    const marks = accountIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT m.json FROM search_index f JOIN messages m ON m.rowid = f.rowid WHERE search_index MATCH ? AND m.account_id IN (${marks}) ORDER BY m.date DESC LIMIT ?`)
      .all(match, ...accountIds, Math.min(Math.max(1, limit), 2000)) as { json: string }[]
    return rows.map((r) => JSON.parse(r.json))
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  clearAccount(accountId: string): void {
    this.db.exec('BEGIN')
    this.db.prepare('DELETE FROM search_index WHERE rowid IN (SELECT rowid FROM messages WHERE account_id = ?)').run(accountId)
    this.db.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId)
    this.db.prepare('DELETE FROM meta WHERE key = ?').run(`hist:${accountId}`)
    this.db.exec('COMMIT')
  }

  clearAll(): void {
    this.db.exec('DELETE FROM messages; DELETE FROM search_index; DELETE FROM meta;')
    this.db.exec('VACUUM')
  }

  count(accountId?: string): number {
    const r = (accountId ? this.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE account_id = ?').get(accountId) : this.db.prepare('SELECT COUNT(*) AS n FROM messages').get()) as { n: number }
    return r.n
  }

  close(): void {
    this.db.close()
  }
}
