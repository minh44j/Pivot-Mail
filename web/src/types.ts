export type FolderId = 'inbox' | 'drafts' | 'sent' | 'archive' | 'deleted'

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
}

export interface Message {
  id: string
  threadId: string
  accountId: string
  folder: FolderId
  labels: string[]
  from: Person
  to: Person[]
  subject: string
  body: string
  date: string
  unread: boolean
  flagged: boolean
  colour?: Colour
  attachments: Attachment[]
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
  subject: string
  body: string
  attachments: Attachment[]
}
