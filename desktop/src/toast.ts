/**
 * New-mail alerts drawn as real Windows toasts (like Outlook's): the sender's initials in a coloured circle, the sender, the subject,
 * the first line of the mail, the mailbox it arrived in, the Windows mail sound, and Open / Mark as read buttons.
 * Clicking uses pivotmail:// links carrying a secret key kept on this computer, so a link opened by a website cannot act on mail.
 */

export interface MailToastOne {
  kind: 'one'
  accountId: string
  messageId: string
  sender: string
  subject: string
  preview: string
  mailbox: string
}
export interface MailToastMany {
  kind: 'many'
  accountId: string
  count: number
  mailbox: string
  lines: { sender: string; subject: string }[]
}
export type MailToast = MailToastOne | MailToastMany

/**
 * Text Windows can put in an alert: characters XML forbids (control codes, U+FFFE/U+FFFF, half of an emoji) become spaces,
 * and the cut is made between whole characters, so an emoji at the limit is never split (a split one makes Windows drop the alert).
 */
const clip = (s: unknown, n: number) =>
  Array.from(
    (typeof s === 'string' ? s : '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, ' ')
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, n)
    .join('')
    .trim()
const isId = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(s)

/** Accepts only what a new-mail alert can contain, trimmed to sensible lengths (the page is never trusted with markup). */
export function cleanToast(x: unknown): MailToast | null {
  if (!x || typeof x !== 'object') return null
  const t = x as Record<string, unknown>
  if (!isId(t.accountId)) return null
  if (t.kind === 'one' && isId(t.messageId)) {
    return { kind: 'one', accountId: t.accountId as string, messageId: t.messageId as string, sender: clip(t.sender, 80) || 'New mail', subject: clip(t.subject, 140) || '(no subject)', preview: clip(t.preview, 200), mailbox: clip(t.mailbox, 100) }
  }
  if (t.kind === 'many' && Array.isArray(t.lines)) {
    const lines = t.lines.slice(0, 3).map((l) => ({ sender: clip((l as { sender?: unknown })?.sender, 60), subject: clip((l as { subject?: unknown })?.subject, 100) }))
    const count = typeof t.count === 'number' && t.count > 1 ? Math.min(Math.floor(t.count), 999) : lines.length
    return { kind: 'many', accountId: t.accountId as string, count, mailbox: clip(t.mailbox, 100), lines }
  }
  return null
}

export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** The toast's XML (Windows ToastGeneric layout). `link` builds a pivotmail:// address for an action. */
export function toastXml(t: MailToast, link: (action: 'open' | 'read' | 'inbox', messageId?: string) => string, avatarUri?: string): string {
  const x = escapeXml
  const logo = avatarUri ? `<image placement="appLogoOverride" hint-crop="circle" src="${x(avatarUri)}"/>` : ''
  const attribution = t.mailbox ? `<text placement="attribution">${x(t.mailbox)}</text>` : ''
  if (t.kind === 'one') {
    return (
      `<toast launch="${x(link('open', t.messageId))}" activationType="protocol" displayTimestamp="${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}">` +
      `<visual><binding template="ToastGeneric">` +
      `<text hint-maxLines="1">${x(t.sender)}</text>` +
      `<text hint-maxLines="1">${x(t.subject)}</text>` +
      (t.preview ? `<text hint-maxLines="2">${x(t.preview)}</text>` : '') +
      logo +
      attribution +
      `</binding></visual>` +
      `<actions>` +
      `<action content="Open" activationType="protocol" arguments="${x(link('open', t.messageId))}"/>` +
      `<action content="Mark as read" activationType="protocol" arguments="${x(link('read', t.messageId))}"/>` +
      `</actions>` +
      `<audio src="ms-winsoundevent:Notification.Mail"/>` +
      `</toast>`
    )
  }
  const rows = t.lines.map((l) => `${l.sender} — ${l.subject}`).join('\n')
  const more = t.count > t.lines.length ? `\n+ ${t.count - t.lines.length} more` : ''
  return (
    `<toast launch="${x(link('inbox'))}" activationType="protocol">` +
    `<visual><binding template="ToastGeneric">` +
    `<text hint-maxLines="1">${t.count} new messages</text>` +
    `<text hint-maxLines="4">${x(rows + more)}</text>` +
    logo +
    attribution +
    `</binding></visual>` +
    `<actions><action content="Open Inbox" activationType="protocol" arguments="${x(link('inbox'))}"/></actions>` +
    `<audio src="ms-winsoundevent:Notification.Mail"/>` +
    `</toast>`
  )
}
