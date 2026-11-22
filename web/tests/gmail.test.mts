import { decodeWords, extractBodies, folderOf, parseAddresses, b64urlToBytes } from '../src/gmail/mime'
import type { GMessage, GPart } from '../src/gmail/mime'
import { toMessage, unescapeSnippet } from '../src/gmail/map'
import { buildBatch, parseBatch, costOf, spend, slowDown, resetBudgets, BURST_UNITS, RATE_UNITS_PER_SECOND, sendRaw, GmailError, SEND_UNCONFIRMED } from '../src/gmail/client'

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


// ---- Reply-To
const mk = (headers: { name: string; value: string }[]): GMessage => ({ id: 'm1', threadId: 't1', labelIds: ['INBOX'], internalDate: '1700000000000', payload: { headers, parts: [{ mimeType: 'text/plain', body: { data: b64('hi') } }] } })
let rt = toMessage('acc', mk([{ name: 'From', value: 'Website <noreply@pivotscl.com>' }, { name: 'Reply-To', value: 'Buyer Name <buyer@client.example>' }, { name: 'Subject', value: 'Enquiry' }]))
ok('Reply-To is kept when it names someone else', rt?.replyTo?.length === 1 && rt.replyTo[0]?.email === 'buyer@client.example' && rt.replyTo[0]?.name === 'Buyer Name')
rt = toMessage('acc', mk([{ name: 'From', value: 'Ann <ann@x.example>' }, { name: 'Reply-To', value: 'ann@x.example' }, { name: 'Subject', value: 'Same' }]))
ok('Reply-To equal to the sender is dropped', rt?.replyTo === undefined)
rt = toMessage('acc', mk([{ name: 'From', value: 'Ann <ann@x.example>' }, { name: 'Subject', value: 'None' }]))
ok('no Reply-To, nothing set', rt?.replyTo === undefined)
rt = toMessage('acc', mk([{ name: 'From', value: 'L <list@x.example>' }, { name: 'Reply-To', value: 'a@x.example, B <b@x.example>' }, { name: 'Subject', value: 'Two' }]))
ok('several Reply-To addresses are all kept', rt?.replyTo?.length === 2)

// ---- batched requests (many message headers in one request)
{
  const body = buildBatch('B1', ['/gmail/v1/users/me/messages/a?format=metadata', '/gmail/v1/users/me/messages/b?format=metadata'])
  ok('batch: one numbered GET per message, closed properly', body.includes('Content-ID: <item0>\r\n\r\nGET /gmail/v1/users/me/messages/a?format=metadata') && body.includes('<item1>') && body.trimEnd().endsWith('--B1--'))
  // The answer exactly as Google documents it: parts in any order, each an HTTP response with its own headers.
  const answer = [
    '--batch_xyz',
    'Content-Type: application/http',
    'Content-ID: <response-item1>',
    '',
    'HTTP/1.1 404 Not Found',
    'Content-Type: application/json; charset=UTF-8',
    '',
    '{"error":{"code":404,"message":"Requested entity was not found."}}',
    '--batch_xyz',
    'Content-Type: application/http',
    'Content-ID: <response-item0>',
    '',
    'HTTP/1.1 200 OK',
    'Content-Type: application/json; charset=UTF-8',
    'Vary: Origin',
    '',
    '{"id":"a","threadId":"t","labelIds":["INBOX"],"payload":{"headers":[{"name":"Subject","value":"Hi --batch inside text"}]}}',
    '--batch_xyz',
    'Content-Type: application/http',
    'Content-ID: <response-item2>',
    '',
    'HTTP/1.1 429 Too Many Requests',
    '',
    '{"error":{"code":429}}',
    '--batch_xyz--',
    '',
  ].join('\r\n')
  const parts = parseBatch('multipart/mixed; boundary=batch_xyz', answer, 4)
  ok('batch answer: matched back by number, whatever the order', (parts[0]?.body as { id?: string })?.id === 'a' && parts[0]?.status === 200)
  ok('batch answer: a deleted message shows as 404, a busy one as 429, a missing answer as nothing', parts[1]?.status === 404 && parts[2]?.status === 429 && parts[3] === null)
  ok('batch answer: quoted boundary is understood too', parseBatch('multipart/mixed; boundary="batch_xyz"', answer, 1)[0]?.status === 200)
  let threw = false
  try { parseBatch('application/json', '{}', 1) } catch { threw = true }
  ok('batch answer without a boundary is refused (the app then falls back to one by one)', threw)
}

// ---- staying under Gmail's speed limit (regression 2026-11-19: "too many requests" while 4 mailboxes did their first sync)
ok('costs follow Gmail\'s table: list/get 5, conversation 10, history 2, labels 1, send 100, batchModify 50', costOf('GET', '/messages') === 5 && costOf('GET', '/messages/abc') === 5 && costOf('GET', '/threads/t1') === 10 && costOf('GET', '/history') === 2 && costOf('GET', '/labels') === 1 && costOf('POST', '/messages/send') === 100 && costOf('POST', '', ) === 100 && costOf('POST', '/messages/batchModify') === 50 && costOf('POST', '/threads/t1/modify') === 10)
ok('the budget stays under Gmail\'s 250 units a second per mailbox (room for two copies of the app)', RATE_UNITS_PER_SECOND * 5 + BURST_UNITS <= 1250)
{
  resetBudgets()
  const t0 = Date.now()
  for (let i = 0; i < 100; i++) await spend('A', 5) // the newest 100 messages: the burst, at once
  const burstMs = Date.now() - t0
  const t1 = Date.now()
  for (let i = 0; i < 16; i++) await spend('A', 5) // 80 more units: about half a second at 160 a second
  const paced = Date.now() - t1
  ok(`the first 100 messages go at once (${burstMs} ms), then the pace is held (80 units took ${paced} ms)`, burstMs < 50 && paced >= 450 && paced < 850)
  const t2 = Date.now(); await spend('B', 5)
  ok('each mailbox has its own budget', Date.now() - t2 < 20)
  slowDown('B', 700)
  const t3 = Date.now(); await spend('B', 1)
  ok('"slow down" from Gmail pauses that whole mailbox', Date.now() - t3 >= 650)
  resetBudgets()
}

// ---- sending a large message (2026-11-22: Minhaj's 7 MB mail with six company documents always failed).
// Gmail's /upload address answers without the header browsers need to read a reply from another site, so in the browser
// every answer from it, success included, arrives as a network error. Stand-in for Gmail + the token address below.
{
  const realFetch = globalThis.fetch
  const realTimeout = globalThis.setTimeout
  // waits (budget, look-ups) pass instantly here
  globalThis.setTimeout = ((fn: () => void) => realTimeout(fn, 0)) as unknown as typeof setTimeout
  let calls: { url: string; body: unknown; type: string }[] = []
  let gmail: (url: string, init: RequestInit) => Response | Promise<Response> = () => new Response('{}')
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    if (url.startsWith('/api/accounts/token')) return new Response(JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3600_000 }), { headers: { 'content-type': 'application/json' } })
    calls.push({ url, body: init.body, type: new Headers(init.headers).get('content-type') ?? '' })
    return gmail(url, init)
  }) as typeof fetch
  const isUpload = (u: string) => u.includes('/upload/')
  const corsBlocked = () => Promise.reject(new TypeError('Failed to fetch'))
  const big = Buffer.from('X'.repeat(7 * 1024 * 1024)).toString('base64url') // a 7 MB message
  const small = Buffer.from('Subject: hi\r\n\r\nhello').toString('base64url')
  const sentList = (id: string | null) => new Response(JSON.stringify(id ? { messages: [{ id, threadId: 'T' + id }] } : {}), { headers: { 'content-type': 'application/json' } })

  // 1. Gmail accepts the large message on the ordinary address: sent, the upload address is never touched
  calls = []
  gmail = (u) => (isUpload(u) ? corsBlocked() : new Response(JSON.stringify({ id: 'S1', threadId: 'T1' })))
  let r = await sendRaw('acc1', big, undefined, 'pm-1@pivottmc.com')
  ok('send: a 7 MB message goes to the ordinary send address (the browser can read its answer) and is sent', r.id === 'S1' && calls.length === 1 && !isUpload(calls[0]!.url))

  // 2. Gmail refuses it there as too large: the upload address, whose answer the browser cannot read; the message is then
  //    found in the mailbox by its Message-ID, so it counts as sent (not reported as failed and sent twice)
  calls = []
  let lookups = 0
  gmail = (u) => {
    if (isUpload(u)) return corsBlocked()
    if (u.includes('/messages/send')) return new Response(JSON.stringify({ error: { code: 413 } }), { status: 413 })
    lookups++
    return sentList(lookups >= 3 ? 'S2' : null) // Gmail lists it after a few seconds
  }
  r = await sendRaw('acc1', big, 'thr9', 'pm-2@pivottmc.com')
  const up = calls.find((c) => isUpload(c.url))
  ok('send: too large for the ordinary address: upload address, then found in the mailbox, so it counts as sent', r.id === 'S2' && !!up && lookups === 3)
  const sentBytes = up && up.body instanceof Blob ? Buffer.from(await up.body.arrayBuffer()) : Buffer.alloc(0)
  ok('send: the upload carries the message bytes exactly, and the conversation', up?.type.startsWith('multipart/related; boundary=') === true && sentBytes.includes(Buffer.from(big, 'base64url')) && sentBytes.includes(Buffer.from('{"threadId":"thr9"}')))
  ok('send: the search looks for this message\'s own Message-ID', calls.some((c) => decodeURIComponent(c.url).includes('rfc822msgid:pm-2@pivottmc.com')))

  // 3. ...and never found: an honest "not confirmed", not a plain failure (it may have gone out)
  gmail = (u) => (isUpload(u) ? corsBlocked() : u.includes('/messages/send') ? new Response('{}', { status: 413 }) : sentList(null))
  let err: unknown = null
  try { await sendRaw('acc1', big, undefined, 'pm-3@pivottmc.com') } catch (e) { err = e }
  ok('send: not found after the upload: "not confirmed" (check Sent), not "failed"', err instanceof GmailError && err.message === SEND_UNCONFIRMED)

  // 4. a real refusal on the ordinary address (a small mail, error 400) is reported with its number; no upload
  calls = []
  gmail = () => new Response(JSON.stringify({ error: { code: 400, message: 'Invalid To header' } }), { status: 400 })
  err = null
  try { await sendRaw('acc1', small, undefined, 'pm-4@pivottmc.com') } catch (e) { err = e }
  ok('send: a refused small mail fails with Gmail\'s number, without trying the upload address', err instanceof GmailError && err.status === 400 && !calls.some((c) => isUpload(c.url)))

  // 5. a server error on the ordinary address is NOT retried by upload (it may have gone out already)
  calls = []
  gmail = (u) => (isUpload(u) ? corsBlocked() : new Response('{}', { status: 500 }))
  err = null
  try { await sendRaw('acc1', big, undefined, 'pm-5@pivottmc.com') } catch (e) { err = e }
  ok('send: a Gmail server error is not sent a second way (it may have gone out)', err instanceof GmailError && err.status === 500 && !calls.some((c) => isUpload(c.url)))

  globalThis.fetch = realFetch
  globalThis.setTimeout = realTimeout
  resetBudgets()
}

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
