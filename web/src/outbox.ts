import type { ComposeInit } from './types'

/**
 * The outbox: every message is stored on this computer the moment Send is pressed, and only removed once Gmail has it.
 *
 * Why (audit 2026-11-23, Minhaj: "sending is not proper, sometimes not sending, sometimes keeps in draft"): a send used to
 * live only in the open page. A page reload for a new version, a closed tab, a dropped connection or a sleeping laptop in
 * the middle of it lost the message with no word, and a send whose answer never came back was reported as failed although
 * Gmail had sent it, so it went out twice when sent again.
 *
 * Now: the finished message (the exact bytes, with its own Message-ID) waits here. It is sent; if the answer is lost or
 * Gmail is busy, it stays and is tried again by itself (after a lookup for its Message-ID, so a message Gmail already has
 * is never sent a second time). Only a definite refusal (a bad address, a message Gmail will not take) opens it again for
 * the person. A message written from a Gmail draft has a second step: that draft is removed, also retried until done.
 *
 * Lives in its own small database (IndexedDB) on this device; cleared with the rest of the person's data on sign-out.
 */

export interface OutJob {
  id: string
  accountId: string
  /** The message exactly as it goes to Gmail (base64url) */
  raw: string
  /** Our Message-ID: the same on every attempt, so Gmail can be asked whether it already has the message */
  messageId: string
  threadId?: string
  /** The Gmail draft this message was written from: removed once the message is sent */
  gmailDraftId?: string
  /** What was written, to show it in Sent and to open it again after a refusal */
  d: ComposeInit
  stage: 'send' | 'draft'
  sentId?: string
  sentThreadId?: string
  attempts: number
  nextAt: number
  createdAt: number
  lastError?: string
}

const DB = 'pivot-mail-outbox'
const STORE = 'jobs'

let conn: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  if (!conn) {
    conn = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => {
        const db = req.result
        db.onclose = () => (conn = null)
        db.onversionchange = () => {
          db.close()
          conn = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('outbox blocked'))
    })
    conn.catch(() => (conn = null))
  }
  return conn
}

const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> =>
  open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const r = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(r ? r.result : undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )

/**
 * Where the device's database is not available (a locked-down or private browser window) the outbox lives in memory: the
 * message is still sent and retried, it just does not survive closing the page.
 */
const memory = new Map<string, OutJob>()
let inMemory = false

export const putJob = async (j: OutJob): Promise<void> => {
  if (!inMemory) {
    try {
      await run('readwrite', (s) => s.put(j))
      return
    } catch {
      inMemory = true
    }
  }
  memory.set(j.id, j)
}
export const removeJob = async (id: string): Promise<void> => {
  memory.delete(id)
  if (!inMemory) await run('readwrite', (s) => s.delete(id)).catch(() => undefined)
}
export const allJobs = async (): Promise<OutJob[]> => {
  let stored: OutJob[] = []
  if (!inMemory) {
    try {
      stored = (await run<OutJob[]>('readonly', (s) => s.getAll())) ?? []
    } catch {
      inMemory = true
    }
  }
  return [...stored, ...memory.values()].sort((a, b) => a.createdAt - b.createdAt)
}
export const clearOutbox = async (): Promise<void> => {
  memory.clear()
  await run('readwrite', (s) => s.clear()).catch(() => undefined)
}

/** Wait before the next try: 5 s, 15 s, 30 s, then every minute (a message is never given up on while it may still go). */
export const retryDelay = (attempts: number): number => [5_000, 15_000, 30_000][attempts - 1] ?? 60_000

/** One copy of the app at a time works through the outbox (two browser tabs must not send the same message). */
export async function exclusively<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<T | null>) => Promise<T | null> } }).locks
  if (!locks) return fn()
  return locks.request('pivot-mail-outbox', { ifAvailable: true }, (lock) => (lock ? fn() : Promise.resolve(null)))
}
