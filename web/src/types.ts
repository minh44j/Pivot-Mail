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
  /** Real mail only: where to fetch the bytes from Gmail */
  source?: { accountId: string; messageId: string; attachmentId: string }
  /** A file the person just attached in the composer (kept in memory until sent) */
  file?: File
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
  /** Real mail: the list knows there is an attachment before the message is opened */
  hasAttachments?: boolean
  /** Real mail: false until the full message (body, attachments) has been fetched */
  loaded?: boolean
  /** Real mail: the Message-ID and References headers, needed to reply inside the conversation */
  rfcId?: string
  rfcRefs?: string
  /** Real mail: id of the Gmail draft, when known */
  gmailDraftId?: string
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
  /** Real mail: the Gmail draft this composer edits */
  gmailDraftId?: string
  /** Real mail: reply headers, so the answer joins the conversation */
  reply?: { threadId: string; messageId: string; references: string }
}
