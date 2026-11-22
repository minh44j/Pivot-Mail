/**
 * Where a search looks (Minhaj 2026-11-22): Inbox, Sent, Drafts, Archive or All folders, chosen under the search box. It
 * starts as the folder being looked at; "here" is a folder that is none of those (a custom folder, Deleted Items, a case).
 */
export type SearchIn = 'here' | 'inbox' | 'sent' | 'drafts' | 'archive' | 'all'

export const SEARCH_SCOPES: { id: Exclude<SearchIn, 'here'>; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'archive', label: 'Archive' },
  { id: 'all', label: 'All folders' },
]

const NAMED = new Set<string>(['inbox', 'sent', 'drafts', 'archive'])

/** The scope a search starts with in this view. */
export function defaultSearchIn(sel: { kind: string; id: string }): SearchIn {
  if ((sel.kind === 'folder' || sel.kind === 'all') && NAMED.has(sel.id)) return sel.id as SearchIn
  return 'here'
}

/** Gmail's words for a scope (added to the typed search). */
export const GMAIL_SCOPE: Record<Exclude<SearchIn, 'here' | 'all'>, string> = {
  inbox: 'in:inbox',
  sent: 'in:sent',
  drafts: 'in:drafts',
  archive: '-in:inbox -in:sent -in:drafts -in:trash -in:spam',
}
