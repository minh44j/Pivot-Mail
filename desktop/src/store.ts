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
  html?: string
  inline?: unknown
  [k: string]: unknown
}

/** The newest messages per mailbox handed to the window at start (the rest stays here and is reached through search). */
const LOAD_LIMIT = 5000
/** Characters of text kept with each message in the list (the grey preview line needs about 200). */
const PREVIEW_CHARS = 400
/** A message body longer than this is indexed only in its first part (keeps the index small and fast). */
const BODY_INDEX_CHARS = 20_000
/** Messages kept per mailbox on this computer; beyond it the oldest are dropped (they stay in Gmail and come back through search). */
export const KEEP_PER_ACCOUNT = 50_000
/** Fields a quick list refresh may change on a message whose full body is already stored. */
const LIGHT_FIELDS = ['folder', 'labels', 'unread', 'flagged', 'important', 'hasAttachments'] as const

/** Raised when the database layout changes; an older file is re-indexed from its stored messages on first start. */
const SCHEMA = 2

/**
 * Shipping references are written in many ways: "MSKU 765432-1", "MSKU-7654321", "MSKU7654321", "BL No. MEDU 1234567".
 * This builds, for every message, the joined forms of short runs of words that contain a number (and the number part of joined
 * codes), so a reference is found whether it is typed with or without spaces and dashes, and by its number alone.
 */
export function referencesOf(text: string): string {
  const toks = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const out = new Set<string>()
  for (let i = 0; i < toks.length && out.size < 4000; i++) {
    let joined = ''
    for (let k = 0; k < 4 && i + k < toks.length; k++) {
      const t = toks[i + k] as string
      if (t.length > 20) break
      joined += t
      if (joined.length > 30) break
      if (joined.length >= 5 && /\d/.test(joined) && (k > 0 || /\p{L}/u.test(joined))) out.add(joined)
    }
    const t = toks[i] as string
    if (/\p{L}/u.test(t) && /\d/.test(t)) for (const m of t.matchAll(/(?<=\p{L})\d{4,}/gu)) out.add(m[0])
  }
  return [...out].join(' ')
}

/** A message as a list line: everything the list shows, without the full text, HTML and pictures (see MailStore.load). */
function light(json: string): unknown {
  const m = JSON.parse(json) as Msg
  if (!m.loaded) return m
  const { html: _html, inline: _inline, ...rest } = m
  return { ...rest, body: (m.body ?? '').slice(0, PREVIEW_CHARS), loaded: false }
}

/** Searches only this computer can answer exactly; anything with Gmail's own search words is left to Gmail. */
const GMAIL_SYNTAX =
  /(^|\s)-?(from|to|cc|bcc|subject|label|has|is|in|after|before|older|newer|older_than|newer_than|filename|list|deliveredto|category|size|larger|smaller|rfc822msgid):|(^|\s)-(?=[\p{L}\p{N}"])|(^|\s)(OR|AND)(\s|$)|[{}|]/u

export class MailStore {
  private db: DatabaseSync

  /** Runs fn as one transaction; on any error it is undone, so the database is never left mid-way (and never stuck). */
  private tx(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      -- A 16 MB page cache and in-memory scratch space for sorting search matches. (No memory mapping: with it a disk read error,
      -- e.g. on a company network drive, would crash the whole app instead of failing one query.)
      PRAGMA cache_size = -16000;
      PRAGMA temp_store = MEMORY;
      -- Fold the write-ahead log into the file every ~40 MB instead of every 4 MB: each fold waits for the disk (slow on Windows),
      -- so a big first sync spends far less time waiting.
      PRAGMA wal_autocheckpoint = 10000;
      PRAGMA journal_size_limit = 8388608; -- after each fold the log file is cut back to 8 MB (no 40 MB left lying on disk)
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, date TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_account_date ON messages (account_id, date DESC);
      CREATE INDEX IF NOT EXISTS messages_thread ON messages (account_id, json_extract(json, '$.threadId'));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version < SCHEMA) {
      this.db.exec('DROP TABLE IF EXISTS messages_fts; DROP TABLE IF EXISTS search_index;')
    }
    // The word index: one entry per message, sharing the message's row number (so replacing or removing one is a direct lookup).
    this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(subject, people, body, refs, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3')`)
    if (version < SCHEMA) {
      this.reindex()
      this.db.exec(`PRAGMA user_version = ${SCHEMA}`)
    }
  }

  /** Rebuilds the word index from the stored messages (after an upgrade of the index layout). */
  private reindex(): void {
    const rows = this.db.prepare('SELECT rowid, json FROM messages')
    const index = this.db.prepare('INSERT INTO search_index (rowid, subject, people, body, refs) VALUES (?, ?, ?, ?, ?)')
    this.tx(() => {
      for (const r of rows.iterate() as Iterable<{ rowid: number; json: string }>) index.run(r.rowid, ...this.fields(JSON.parse(r.json) as Msg))
    })
  }

  private fields(m: Msg): [string, string, string, string] {
    const who = [m.from, ...(m.to ?? []), ...(m.cc ?? [])].filter(Boolean).map((p) => `${p?.name ?? ''} ${p?.email ?? ''}`)
    const files = (m.attachments ?? []).map((a) => a?.name ?? '')
    const subject = m.subject ?? ''
    const body = `${m.snippet ?? ''}\n${files.join(' ')}\n${(m.body ?? '').slice(0, BODY_INDEX_CHARS)}`
    return [subject, who.join(' '), body, referencesOf(`${subject}\n${body}`)]
  }

  /**
   * The newest messages of a mailbox for the list, like Outlook: everything the list shows (sender, subject, a preview, flags,
   * attachment names) but not the full text, HTML and pictures, which come from here the moment a message is opened (thread()).
   * Keeps opening the app fast and its memory small however much mail is stored.
   */
  load(accountId: string, limit = LOAD_LIMIT): unknown[] {
    const rows = this.db.prepare('SELECT json FROM messages WHERE account_id = ? ORDER BY date DESC LIMIT ?').all(accountId, Math.min(Math.max(1, limit), 50_000)) as { json: string }[]
    return rows.map((r) => light(r.json))
  }

  /** Every stored message of one conversation, complete (opening a message: no wait for the internet). */
  thread(accountId: string, threadId: string): unknown[] {
    // INDEXED BY: left to itself SQLite reads the whole mailbox by date and filters (40 ms at 25,000 messages); the conversation
    // index finds the few messages directly (well under 1 ms).
    const rows = this.db.prepare("SELECT json FROM messages INDEXED BY messages_thread WHERE account_id = ? AND json_extract(json, '$.threadId') = ? ORDER BY date").all(accountId, threadId) as { json: string }[]
    return rows.map((r) => JSON.parse(r.json))
  }

  save(msgs: Msg[]): void {
    const old = this.db.prepare('SELECT json FROM messages WHERE id = ?')
    const put = this.db.prepare('INSERT INTO messages (id, account_id, date, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, date = excluded.date, json = excluded.json RETURNING rowid')
    const unindex = this.db.prepare('DELETE FROM search_index WHERE rowid = ?')
    const index = this.db.prepare('INSERT INTO search_index (rowid, subject, people, body, refs) VALUES (?, ?, ?, ?, ?)')
    this.tx(() => {
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
        index.run(rowid, ...this.fields(m))
      }
    })
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
    this.tx(() => {
      for (const id of ids) {
        const r = del.get(id) as { rowid: number } | undefined
        if (r) unindex.run(r.rowid)
      }
    })
  }

  /**
   * Instant search over everything stored. Plain words must all appear (in any field, as word beginnings: "invo" finds "invoice");
   * Gmail-style operators such as from: or has:attachment are left to Gmail's own search, which runs right after.
   */
  search(accountIds: string[], query: string, limit = 300): unknown[] {
    // from:, has:, -word, OR ... mean something precise in Gmail; a local guess could show mail that does not match.
    if (GMAIL_SYNTAX.test(query)) return []
    const words = query
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/["*^():]/g, '').trim())
      .filter((w) => /[\p{L}\p{N}]/u.test(w))
      .slice(0, 12)
    if (words.length === 0 || accountIds.length === 0) return []
    accountIds = [...new Set(accountIds)].slice(0, 50)
    let match = words.map((w) => `"${w}"*`).join(' AND ')
    // A reference typed with or without spaces and dashes ("MSKU 765432-1", "msku7654321", "7654321") also matches its joined form.
    const joined = words.join('').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    const isRef = /\d/.test(joined) && joined.length >= 5 && joined.length <= 30
    if (isRef) match = `(${match}) OR refs : "${joined}"*`
    const n = Math.min(Math.max(1, limit), 2000)
    const ids = (m: string) => (this.db.prepare('SELECT rowid AS r FROM search_index WHERE search_index MATCH ? LIMIT 1001').all(m) as { r: number }[]).map((x) => x.r)
    // 1. What the word index matched (row numbers only: cheap). A reference typed in pieces ("MSKU 1043210") is looked up in
    //    its joined form first: one direct entry, where the piece "MSKU" alone matches every container number (100 ms on a
    //    Mac with 50,000 messages). The joined form already covers the pieces written side by side; only when it finds
    //    nothing are the pieces searched one by one.
    let found = isRef && words.length > 1 ? ids(`refs : "${joined}"*`) : []
    if (found.length === 0) found = ids(match)
    if (found.length === 0) return []
    const marks = accountIds.map(() => '?').join(',')
    let hits: { r: number }[]
    if (found.length <= 1000) {
      // 2a. A few matches (a reference number, a rare name): read just their dates and sort them.
      hits = this.db
        .prepare(`SELECT rowid AS r FROM messages WHERE rowid IN (${found.map(() => '?').join(',')}) AND account_id IN (${marks}) ORDER BY date DESC LIMIT ?`)
        .all(...found, ...accountIds, n) as { r: number }[]
    } else {
      // 2b. Many matches (a common word): walk the small (mailbox, date) index newest-first and keep the matched ones, so the big
      //     stored messages are never read just to learn their date (that made a common word take 0.4 s on a Mac with 50,000
      //     messages). Several mailboxes: the newest of each, merged by date.
      const q = this.db.prepare(
        'SELECT rowid AS r, date FROM messages INDEXED BY messages_account_date WHERE account_id = ? AND rowid IN (SELECT rowid FROM search_index WHERE search_index MATCH ?) ORDER BY date DESC LIMIT ?',
      )
      const all = accountIds.flatMap((a) => q.all(a, match, n) as { r: number; date: string }[])
      hits = accountIds.length > 1 ? all.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)).slice(0, n) : all
    }
    // 3. Only the page of results is read in full.
    const get = this.db.prepare('SELECT json FROM messages WHERE rowid = ?')
    return hits.map((h) => light((get.get(h.r) as { json: string }).json))
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  clearAccount(accountId: string): void {
    this.tx(() => {
      this.db.prepare('DELETE FROM search_index WHERE rowid IN (SELECT rowid FROM messages WHERE account_id = ?)').run(accountId)
      this.db.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId)
      this.db.prepare('DELETE FROM meta WHERE key = ?').run(`hist:${accountId}`)
    })
  }

  clearAll(): void {
    this.tx(() => this.db.exec('DELETE FROM messages; DELETE FROM search_index; DELETE FROM meta;'))
    // Rewrite the file without the old pages, and empty the write-ahead log too, so no deleted mail stays readable on disk.
    this.db.exec('VACUUM')
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  count(accountId?: string): number {
    const r = (accountId ? this.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE account_id = ?').get(accountId) : this.db.prepare('SELECT COUNT(*) AS n FROM messages').get()) as { n: number }
    return r.n
  }

  close(): void {
    this.db.close()
  }
}
