import { decodeWords, extractBodies, folderOf, parseAddresses, b64urlToBytes } from '../src/gmail/mime'
import type { GMessage, GPart } from '../src/gmail/mime'
import { toMessage, unescapeSnippet } from '../src/gmail/map'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64url')

// ---- header decoding
ok('decodes B-encoded UTF-8 subject', decodeWords('=?UTF-8?B?SGVsbG8gV29ybGQ=?=') === 'Hello World')
ok('decodes Q-encoded with accents', decodeWords('=?ISO-8859-1?Q?Caf=E9_Rouge?=') === 'Café Rouge')
ok('adjacent encoded words are joined without the space', decodeWords('=?UTF-8?B?SGVs?= =?UTF-8?B?bG8=?=') === 'Hello')
ok('plain text is untouched', decodeWords('Quarterly review #12') === 'Quarterly review #12')
ok('arabic subject survives', decodeWords(`=?UTF-8?B?${b64('طلب حجز')}?=`) === 'طلب حجز')
ok('broken encoded word does not throw', typeof decodeWords('=?UTF-8?B?%%%?=') === 'string')

// ---- addresses
let a = parseAddresses('"Okafor, Hana" <HANA@acme.example>, bob@x.example, Liam <liam@y.example>')
ok('quoted comma in a name', a.length === 3 && a[0]?.name === 'Okafor, Hana' && a[0]?.email === 'hana@acme.example')
ok('bare address uses itself as the name', a[1]?.name === 'bob@x.example')
ok('encoded display name', parseAddresses('=?UTF-8?Q?Jos=C3=A9?= <j@x.example>')[0]?.name === 'José')
ok('empty and garbage give nothing', parseAddresses('').length === 0 && parseAddresses('not an address').length === 0 && parseAddresses(undefined).length === 0)
ok('group of three with angle brackets containing commas of names', parseAddresses('A <a@x.example>,B <b@x.example>,C <c@x.example>').length === 3)

// ---- folders
ok('INBOX wins', folderOf(['INBOX', 'SENT', 'UNREAD']) === 'inbox')
ok('sent only', folderOf(['SENT']) === 'sent')
ok('trash beats inbox', folderOf(['INBOX', 'TRASH']) === 'deleted')
ok('draft', folderOf(['DRAFT']) === 'drafts')
ok('no system label = archive', folderOf(['Label_12']) === 'archive' && folderOf([]) === 'archive' && folderOf(undefined) === 'archive')
ok('spam recognised', folderOf(['SPAM']) === 'spam')

// ---- MIME
const alt: GPart = {
  mimeType: 'multipart/mixed',
  parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="iso-8859-1"' }], body: { data: b64(Buffer.from('Caf\xe9 plain', 'latin1')) } },
      { mimeType: 'text/html', body: { data: b64('<p>Hello <b>html</b></p>') } },
    ] },
    { mimeType: 'application/pdf', filename: '=?UTF-8?B?cmVwb3J0LnBkZg==?=', body: { attachmentId: 'ATT1', size: 1234 } },
    { mimeType: 'image/png', filename: '', headers: [{ name: 'Content-ID', value: '<logo>' }], body: { attachmentId: 'INLINE', size: 10 } },
  ],
}
const e = extractBodies(alt)
ok('plain part decoded with its charset', e.text === 'Café plain')
ok('html part read', e.html === '<p>Hello <b>html</b></p>')
ok('attachment found with decoded name and size', e.attachments.length === 1 && e.attachments[0]?.name === 'report.pdf' && e.attachments[0]?.size === 1234)
ok('inline part without a filename is not an attachment', !e.attachments.some((x) => x.attachmentId === 'INLINE'))
// ---- inline images (cid:)
const pngB64 = b64(Buffer.from('89504e470d0a1a0a', 'hex'))
const related: GPart = {
  mimeType: 'multipart/related',
  parts: [
    { mimeType: 'text/html', body: { data: b64('<p>Hi</p><img src="cid:logo@x"><img src="CID:big@x">') } },
    { mimeType: 'image/png', filename: 'logo.png', headers: [{ name: 'Content-ID', value: '<logo@x>' }], body: { data: pngB64, size: 8 } },
    { mimeType: 'image/jpeg', filename: 'big.jpg', headers: [{ name: 'Content-Id', value: '<BIG@x>' }], body: { attachmentId: 'ATT1', size: 90000 } },
    { mimeType: 'image/png', filename: 'unused.png', headers: [{ name: 'Content-ID', value: '<unused@x>' }], body: { attachmentId: 'ATT2', size: 100 } },
    { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'ATT3', size: 5 } },
  ],
}
const rel = extractBodies(related)
ok('images used in the body are inline, matched without case or brackets', Object.keys(rel.inline).sort().join() === 'big@x,logo@x')
ok('a small inline image carries its data, a big one its attachment id', rel.inline['logo@x']?.data === pngB64 && rel.inline['big@x']?.attachmentId === 'ATT1')
ok('inline images are not listed as attachments; unused ones and real files are', rel.attachments.map((x) => x.name).sort().join() === 'doc.pdf,unused.png')
ok('empty payload is safe', extractBodies(undefined).text === '' && extractBodies({}).attachments.length === 0)
const deep: GPart = { mimeType: 'multipart/mixed', parts: [] }
let cur = deep
for (let i = 0; i < 40; i++) { const n: GPart = { mimeType: 'multipart/mixed', parts: [] }; cur.parts!.push(n); cur = n }
cur.parts!.push({ mimeType: 'text/plain', body: { data: b64('too deep') } })
ok('absurdly deep nesting is cut off, not crashed on', extractBodies(deep).text === '')
ok('b64url round trip with url-safe characters', Buffer.from(b64urlToBytes(b64(Uint8Array.from([251, 255, 254])))).equals(Buffer.from([251, 255, 254])))

// ---- messages
ok('snippet entities', unescapeSnippet('Tom &amp; Jerry &#39;s &quot;x&quot; &lt;b&gt; &#x41;') === 'Tom & Jerry \'s "x" <b> A')
const meta: GMessage = {
  id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD', 'STARRED', 'Label_1'], snippet: 'Hello &amp; welcome', internalDate: String(Date.UTC(2026, 10, 16, 9, 0, 0)),
  payload: { headers: [{ name: 'From', value: 'Hana <hana@acme.example>' }, { name: 'To', value: 'you@pivotscl.com' }, { name: 'Subject', value: '=?UTF-8?B?UXVvdGU=?=' }, { name: 'Date', value: 'x' }] },
}
const m = toMessage('acc1', meta, { Label_1: 'Clients' })!
ok('metadata message: ids, folder, flags', m.id === 'acc1:m1' && m.threadId === 't1' && m.folder === 'inbox' && m.unread && m.flagged && m.loaded === false)
ok('metadata message: subject, sender, snippet as body', m.subject === 'Quote' && m.from.email === 'hana@acme.example' && m.body === 'Hello & welcome')
ok('custom labels become names', m.labels.join() === 'Clients')
ok('date from Gmail internalDate, not the header', m.date === '2026-11-16T09:00:00.000Z')
ok('spam is never shown', toMessage('acc1', { ...meta, labelIds: ['SPAM'] }) === null)
const full = toMessage('acc1', { id: 'm2', threadId: 't1', labelIds: ['SENT'], internalDate: '1', payload: { ...alt, headers: [{ name: 'Subject', value: 'Re: Quote' }] } })!
ok('full message: loaded, bodies, attachment source', full.loaded === true && full.body === 'Café plain' && full.html === '<p>Hello <b>html</b></p>' && full.attachments[0]?.source?.attachmentId === 'ATT1' && full.attachments[0]?.source?.messageId === 'm2')
const htmlOnly = toMessage('acc1', { id: 'm3', threadId: 't3', labelIds: ['INBOX'], internalDate: '1', payload: { mimeType: 'text/html', body: { data: b64('<div>One</div><div>Two&amp;Three</div><style>x{}</style>') } } })!
ok('html-only message still has plain text', htmlOnly.body === 'One\nTwo&Three')
ok('missing subject and sender are handled', toMessage('a', { id: 'x', threadId: 'y', labelIds: ['INBOX'], payload: {} })?.subject === '(no subject)')

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
