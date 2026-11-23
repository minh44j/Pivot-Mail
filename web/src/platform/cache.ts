import type { Message } from '../types'
import { desktopStore } from '../desktop'

/**
 * Local copy of fetched mail, so the list opens instantly and survives a reload. Lives only on this device.
 * In a browser it is IndexedDB (up to 4,000 messages per mailbox); in the Windows app it is the app's own database
 * (desktop/src/store.ts: up to 50,000 per mailbox, with instant word search).
 * Cleared on sign-out and when a mailbox is removed. Every call fails soft: without it the app simply fetches again.
 */
const DB = 'pivot-mail'
const STORE = 'messages'
const META = 'meta'
const MAX_PER_ACCOUNT = 4000

/** One connection for the whole session (it used to open a new one for every read and write). */
let conn: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  if (!conn) {
    conn = openDb()
    conn.then(
      (db) => {
        db.onclose = () => (conn = null)
        db.onversionchange = () => {
          db.close()
          conn = null
        }
      },
      () => (conn = null),
    )
  }
  return conn
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('accountId', 'accountId')
      if (!req.result.objectStoreNames.contains(META)) req.result.createObjectStore(META, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

async function load(accountId: string): Promise<Message[]> {
  try {
    const db = await open()
    return await new Promise<Message[]>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).index('accountId').getAll(accountId)
      r.onsuccess = () => resolve(r.result as Message[])
      r.onerror = () => reject(r.error)
    })
  } catch {
    return []
  }
}

async function save(msgs: Message[]): Promise<void> {
  if (msgs.length === 0) return
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const s = tx.objectStore(STORE)
    for (const m of msgs) s.put(m)
    await done(tx)
    // Keep each mailbox's copy bounded: drop the oldest beyond the limit. Counted first (cheap); the whole copy is read and
    // sorted only when it is over (it used to be read and sorted after every batch of mail).
    const accounts = new Set(msgs.map((m) => m.accountId))
    for (const id of accounts) {
      const n = await new Promise<number>((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).index('accountId').count(id)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      if (n <= MAX_PER_ACCOUNT) continue
      const all = await load(id)
      if (all.length <= MAX_PER_ACCOUNT) continue
      const drop = all.sort((a, b) => a.date.localeCompare(b.date)).slice(0, all.length - MAX_PER_ACCOUNT)
      const tx2 = db.transaction(STORE, 'readwrite')
      for (const m of drop) tx2.objectStore(STORE).delete(m.id)
      await done(tx2)
    }
  } catch {
    /* cache is optional */
  }
}

async function clearAccount(accountId: string): Promise<void> {
  try {
    const db = await open()
    const all = await load(accountId)
    const tx = db.transaction([STORE, META], 'readwrite')
    for (const m of all) tx.objectStore(STORE).delete(m.id)
    tx.objectStore(META).delete(`hist:${accountId}`)
    await done(tx)
  } catch {
    /* nothing to clear */
  }
}

async function clearAll(): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction([STORE, META], 'readwrite')
    tx.objectStore(STORE).clear()
    tx.objectStore(META).clear()
    await done(tx)
  } catch {
    // Could not be emptied (a broken or blocked database): the whole database is removed instead, so the previous person's
    // mail copy never stays on a shared computer (audit 2026-11-22).
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(DB)
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      } catch {
        resolve() // no database support at all: nothing was ever stored
      }
    })
  }
}

async function remove(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    for (const id of ids) tx.objectStore(STORE).delete(id)
    await done(tx)
  } catch {
    /* cache is optional */
  }
}

/** Small values kept beside the mail, such as where change tracking stopped. */
async function getMeta(key: string): Promise<string | null> {
  try {
    const db = await open()
    return await new Promise<string | null>((resolve, reject) => {
      const r = db.transaction(META).objectStore(META).get(key)
      r.onsuccess = () => resolve((r.result as { value: string } | undefined)?.value ?? null)
      r.onerror = () => reject(r.error)
    })
  } catch {
    return null
  }
}

async function setMeta(key: string, value: string): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put({ key, value })
    await done(tx)
  } catch {
    /* cache is optional */
  }
}

/** The same calls, answered by the desktop app's database. A failure there behaves like an empty copy, never an error. */
const soft = async <T>(p: Promise<unknown>, fallback: T, ok: (v: unknown) => boolean): Promise<T> => {
  try {
    const v = await p
    return ok(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
const isList = (v: unknown) => Array.isArray(v)
const isText = (v: unknown) => typeof v === 'string'
const any = () => true

/**
 * While a person's mail is being wiped (sign-out, a different person, a removed mailbox), late writes from work still in flight
 * (a sync that was half way, a change saved a second later) must not put any of it back. Sign-out locks every write until the page
 * reloads; a removed mailbox blocks writes for that mailbox.
 */
let locked = false
const blocked = new Set<string>()
const writable = (msgs: Message[]) => (locked ? [] : msgs.filter((m) => !blocked.has(m.accountId)))

export const cache = {
  load: (accountId: string): Promise<Message[]> => {
    const d = desktopStore()
    return d ? soft(d.load(accountId), [], isList) : load(accountId)
  },
  save: async (all: Message[]): Promise<void> => {
    const msgs = writable(all)
    const d = desktopStore()
    if (!d) return save(msgs)
    if (msgs.length > 0) await soft(d.save(msgs), null, any)
  },
  remove: async (ids: string[]): Promise<void> => {
    if (locked) return
    const d = desktopStore()
    if (!d) return remove(ids)
    if (ids.length > 0) await soft(d.remove(ids), null, any)
  },
  getMeta: (key: string): Promise<string | null> => {
    const d = desktopStore()
    return d ? soft(d.getMeta(key), null, isText) : getMeta(key)
  },
  setMeta: async (key: string, value: string): Promise<void> => {
    if (locked || [...blocked].some((id) => key.endsWith(`:${id}`))) return
    const d = desktopStore()
    if (!d) return setMeta(key, value)
    await soft(d.setMeta(key, value), null, any)
  },
  clearAccount: async (accountId: string): Promise<void> => {
    blocked.add(accountId)
    const d = desktopStore()
    // Also clear any browser copy left from before the desktop database existed.
    await clearAccount(accountId)
    if (d) await soft(d.clearAccount(accountId), null, any)
  },
  clearAll: async (): Promise<void> => {
    locked = true
    const d = desktopStore()
    await clearAll()
    if (d) await soft(d.clearAll(), null, any)
  },
  /** Desktop app only: a conversation complete from this computer (null in a browser, or with an older desktop app). */
  thread: (accountId: string, threadId: string): Promise<Message[]> | null => {
    const d = desktopStore()
    return d?.thread ? soft(d.thread(accountId, threadId), [], isList) : null
  },
  /** Desktop app only: instant search of everything stored on this computer (null in a browser: there, Gmail's search does it). */
  search: (accountIds: string[], query: string): Promise<Message[]> | null => {
    const d = desktopStore()
    return d ? soft(d.search(accountIds, query), [], isList) : null
  },
}
