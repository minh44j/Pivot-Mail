export type FolderId = 'inbox' | 'drafts' | 'sent' | 'archive' | 'deleted' | 'scheduled' | 'snoozed'

export type Colour = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export interface Person {
  name: string
  email: string
}

export interface Attachment {
  id: string
  name: string
  size: number
  mime: string
}

export interface Account {
  id: string
  name: string
  email: string
  shared: boolean
  signature: string
  /** Real mailboxes only: 'needs_reconnect' when Google no longer accepts the saved permission */
  status?: 'active' | 'needs_reconnect' | 'disabled'
}

export interface Message {
  id: string
  threadId: string
  accountId: string
  folder: FolderId
  labels: string[]
  from: Person
  to: Person[]
  cc?: Person[]
  subject: string
  body: string
  /** Original HTML body, shown only after sanitising (see mailhtml.ts) */
  html?: string
  date: string
  unread: boolean
  flagged: boolean
  important?: boolean
  colour?: Colour
  attachments: Attachment[]
  /** Scheduled send time (folder 'scheduled') */
  sendAt?: string
  /** Snoozed until (folder 'snoozed'); returns to the Inbox as unread */
  snoozedUntil?: string
  /** Follow-up due date, set with the flag */
  dueAt?: string
}

export interface Row {
  msg: Message
  count: number
  unread: boolean
}

export type PaneLayout = 'right' | 'bottom' | 'off'
export type Density = 'comfortable' | 'compact'
export type MobileView = 'folders' | 'list' | 'read'

export interface ComposeInit {
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  attachments: Attachment[]
  /** Set when an existing draft is reopened; the body is then used as it is (signature already inside) */
  draftId?: string
}
