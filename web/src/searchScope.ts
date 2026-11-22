/**
 * Where a search looks (Minhaj 2026-11-22): Inbox, Sent, Drafts, Archive or All folders, chosen under the search box; "here"
 * is the open folder when it is none of those (a custom folder, Deleted Items, a case). A search starts in All folders, as in
 * Outlook: searching from the Inbox first looked in the Inbox only, so a reply the person had sent that day was missing and
 * the mailbox looked "not synced" (a staff complaint, 2026-11-22).
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

/** The scope a search starts with. */
export function defaultSearchIn(): SearchIn {
  return 'all'
}

/** The open folder is one of the named scopes (else it is offered first, as "here"). */
export const isNamedScope = (sel: { kind: string; id: string }): boolean => (sel.kind === 'folder' || sel.kind === 'all') && NAMED.has(sel.id)

/** Short folder names shown on results from all folders. */
export const FOLDER_TAG: Record<string, string> = { inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', deleted: 'Deleted', snoozed: 'Snoozed', scheduled: 'Scheduled', spam: 'Spam' }

/** Gmail's words for a scope (added to the typed search). */
export const GMAIL_SCOPE: Record<Exclude<SearchIn, 'here' | 'all'>, string> = {
  inbox: 'in:inbox',
  sent: 'in:sent',
  drafts: 'in:drafts',
  archive: '-in:inbox -in:sent -in:drafts -in:trash -in:spam',
}
