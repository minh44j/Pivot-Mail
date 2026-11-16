import type { FolderId, Message } from '../types'
import { modifyMessages, modifyThread, pool, trashThread, untrashThread } from './client'

/** Moves a whole conversation between Gmail's views, the way Gmail's own buttons do. */
export async function moveThread(accountId: string, threadId: string, from: FolderId, to: FolderId): Promise<void> {
  if (from === to) return
  if (from === 'deleted') await untrashThread(accountId, threadId)
  if (to === 'deleted') {
    await trashThread(accountId, threadId)
    return
  }
  if (to === 'inbox') await modifyThread(accountId, threadId, ['INBOX'], [])
  else if (to === 'archive') await modifyThread(accountId, threadId, [], ['INBOX'])
}

export interface ThreadRef {
  accountId: string
  threadId: string
  /** Where the conversation is now: the Inbox if any of its mail is there, otherwise its newest message's folder */
  folder: FolderId
  /** Gmail ids of its messages that are loaded here */
  gids: string[]
  newestGid: string
}

export const gid = (m: Message): string => m.id.slice(m.accountId.length + 1)

/** Groups messages into conversations with what the actions need to know. */
export function threadsOf(msgs: Message[]): ThreadRef[] {
  const by = new Map<string, Message[]>()
  for (const m of msgs) {
    const k = `${m.accountId}/${m.threadId}`
    by.set(k, [...(by.get(k) ?? []), m])
  }
  return [...by.values()].map((g) => {
    const sorted = [...g].sort((a, b) => a.date.localeCompare(b.date))
    const newest = sorted[sorted.length - 1] as Message
    return {
      accountId: newest.accountId,
      threadId: newest.threadId,
      folder: g.some((m) => m.folder === 'inbox') ? 'inbox' : newest.folder,
      gids: g.map(gid),
      newestGid: gid(newest),
    }
  })
}

export const forThreads = <T>(ts: ThreadRef[], fn: (t: ThreadRef) => Promise<T>): Promise<T[]> => pool(ts, 4, fn)

export const labelsOn = async (accountId: string, ids: string[], add: string[], remove: string[]): Promise<void> => (ids.length ? modifyMessages(accountId, ids, add, remove) : undefined)
