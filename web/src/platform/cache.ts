import type { Message } from '../types'

/**
 * Local copy of fetched mail (IndexedDB), so the list opens instantly and survives a reload. Lives only on this device.
 * Cleared on sign-out and when a mailbox is removed. Every call fails soft: without IndexedDB the app simply fetches again.
 */
const DB = 'pivot-mail'
const STORE = 'messages'
const META = 'meta'
const MAX_PER_ACCOUNT = 4000

function open(): Promise<IDBDatabase> {
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
    // Keep each mailbox's copy bounded: drop the oldest beyond the limit.
    const accounts = new Set(msgs.map((m) => m.accountId))
    for (const id of accounts) {
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
    /* nothing to clear */
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

export const cache = { load, save, remove, getMeta, setMeta, clearAccount, clearAll }
