import { GmailError, listHistory } from './client'

export interface Changes {
  /** Where to continue next time */
  latestId: string
  /** New messages (id to the labels it has) */
  added: Map<string, { threadId: string; labelIds: string[] }>
  deleted: Set<string>
  /** Messages whose labels changed (read, starred, moved, labelled), with their labels as they are now */
  labels: Map<string, { threadId: string; labelIds: string[] }>
}

/** Everything that happened in a mailbox since `startId`, folded into net changes. Returns 'expired' when Gmail no longer has that point. */
export async function fetchChanges(accountId: string, startId: string): Promise<Changes | 'expired'> {
  const out: Changes = { latestId: startId, added: new Map(), deleted: new Set(), labels: new Map() }
  let token: string | undefined
  do {
    let page
    try {
      page = await listHistory(accountId, startId, token)
    } catch (e) {
      if (e instanceof GmailError && e.status === 404) return 'expired'
      throw e
    }
    if (page.historyId) out.latestId = page.historyId
    for (const h of page.history ?? []) {
      for (const a of h.messagesAdded ?? []) {
        out.deleted.delete(a.message.id)
        out.added.set(a.message.id, { threadId: a.message.threadId, labelIds: a.message.labelIds ?? [] })
        out.labels.set(a.message.id, { threadId: a.message.threadId, labelIds: a.message.labelIds ?? [] })
      }
      for (const l of [...(h.labelsAdded ?? []), ...(h.labelsRemoved ?? [])]) {
        if (out.deleted.has(l.message.id)) continue
        const v = { threadId: l.message.threadId, labelIds: l.message.labelIds ?? [] }
        out.labels.set(l.message.id, v)
        if (out.added.has(l.message.id)) out.added.set(l.message.id, v)
      }
      for (const d of h.messagesDeleted ?? []) {
        out.deleted.add(d.message.id)
        out.added.delete(d.message.id)
        out.labels.delete(d.message.id)
      }
    }
    token = page.nextPageToken
  } while (token)
  return out
}
