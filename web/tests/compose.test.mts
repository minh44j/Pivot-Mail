import { buildMime, encodeHeaderText, extractInlineImages, formatAddress, outgoingHtml, parseRecipients, toRaw } from '../src/gmail/compose'
import { decodeWords, parseAddresses } from '../src/gmail/mime'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

// ---- a tiny independent reader of what we produce
const unfold = (s: string) => s.replace(/\r\n[ \t]+/g, ' ')
function split(raw: string) { const i = raw.indexOf('\r\n\r\n'); return { head: raw.slice(0, i), body: raw.slice(i + 4) } }
function headers(head: string) { const h: Record<string, string> = {}; for (const l of unfold(head).split('\r\n')) { const k = l.indexOf(':'); if (k > 0) h[l.slice(0, k).toLowerCase()] = l.slice(k + 1).trim() } return h }
function parts(body: string, b: string) { return body.split(`--${b}`).slice(1).filter((p) => !p.startsWith('--')).map((p) => p.replace(/^\r\n/, '').replace(/\r\n$/, '')) }
const decodeB64 = (s: string) => Buffer.from(s.replace(/\r\n/g, ''), 'base64')
const bnd = (ct: string) => ct.match(/boundary="([^"]+)"/)![1]

const base = { from: { name: 'Ann Lee', email: 'ann@pivotscl.com' }, to: [{ name: 'Hana Okafor', email: 'hana@acme.example' }], cc: [], bcc: [], subject: 'Quote', html: '<p>Hello <b>Hana</b></p>', text: 'Hello Hana', attachments: [] as { name: string; mime: string; bytes: Uint8Array }[] }

// ---- simple message
let raw = buildMime({ ...base, date: new Date('2026-11-16T09:00:00Z') })
let { head, body } = split(raw)
let h = headers(head)
ok('From, To, Subject, MIME-Version present', h.from === 'Ann Lee <ann@pivotscl.com>' && h.to === 'Hana Okafor <hana@acme.example>' && h.subject === 'Quote' && h['mime-version'] === '1.0')
ok('Date is RFC 5322 with a numeric zone', h.date === 'Mon, 16 Nov 2026 09:00:00 +0000')
const alt = parts(body, bnd(h['content-type']!))
ok('multipart/alternative with text then html', alt.length === 2 && alt[0]!.includes('text/plain') && alt[1]!.includes('text/html'))
ok('html and text survive base64 round trip', decodeB64(split(alt[1]!).body).toString() === '<p>Hello <b>Hana</b></p>' && decodeB64(split(alt[0]!).body).toString() === 'Hello Hana')
ok('only CRLF line endings', !/[^\r]\n/.test(raw))
ok('all lines under 998 and body lines at most 76', raw.split('\r\n').every((l) => l.length <= 998) && alt.every((p) => split(p).body.split('\r\n').every((l) => l.length <= 76)))
ok('no Bcc header when there is no Bcc', h.bcc === undefined && h.cc === undefined)

// ---- unicode
const ar = 'طلب حجز رحلة إلى دبي – ✈️ Café'
raw = buildMime({ ...base, subject: ar, to: [{ name: 'José Müller', email: 'jose@x.example' }, { name: 'مها', email: 'maha@x.example' }] })
h = headers(split(raw).head)
ok('non-ASCII subject is encoded words and decodes back', /^=\?UTF-8\?B\?/.test(h.subject!) && decodeWords(h.subject!) === ar)
ok('encoded words stay within 75 characters per line', split(raw).head.split('\r\n').every((l) => l.length <= 78))
ok('non-ASCII display names decode back', parseAddresses(h.to!).map((a) => a.name).join('|') === 'José Müller|مها')
// oxlint-disable-next-line no-control-regex
ok('header stays pure ASCII', /^[\x00-\x7f]*$/.test(split(raw).head))

// ---- long ASCII subject
const long = 'Re: ' + 'shipment documents for the container arriving next week '.repeat(4).trim()
raw = buildMime({ ...base, subject: long })
ok('long ASCII subject is folded and unfolds to the original', split(raw).head.split('\r\n').every((l) => l.length <= 78) && headers(split(raw).head).subject === long)

// ---- injection
raw = buildMime({ ...base, subject: 'Hi\r\nBcc: evil@x.example\r\nX-Injected: 1', to: [{ name: 'Bad\r\nBcc: evil@y.example', email: 'a@b.example\r\nBcc: evil@z.example' }] })
h = headers(split(raw).head)
ok('line breaks in subject cannot add headers', h.bcc === undefined && h['x-injected'] === undefined)
ok('line breaks in names and addresses cannot add headers', !/evil@/.test(h.to ?? '') || !split(raw).head.includes('\r\nBcc:'))

// ---- names needing quotes
ok('comma in a name is quoted', formatAddress({ name: 'Okafor, Hana', email: 'h@x.example' }) === '"Okafor, Hana" <h@x.example>')
ok('quote in a name is escaped', formatAddress({ name: 'Hana "H" O', email: 'h@x.example' }) === '"Hana \\"H\\" O" <h@x.example>')
ok('name equal to the address collapses', formatAddress({ name: 'h@x.example', email: 'h@x.example' }) === 'h@x.example')
const back = parseAddresses(`${formatAddress({ name: 'Okafor, Hana', email: 'h@x.example' })}, ${formatAddress({ name: 'B', email: 'b@x.example' })}`)
ok('quoted names parse back', back.length === 2 && back[0]!.name === 'Okafor, Hana')
ok('recipients typed in the composer', parseRecipients('Hana <h@x.example>; b@y.example, "O, X" <o@z.example>').length === 3)

// ---- Cc / Bcc / reply headers
raw = buildMime({ ...base, cc: [{ name: 'A', email: 'a@x.example' }], bcc: [{ name: 'B', email: 'b@x.example' }], inReplyTo: '<orig@mail.example>', references: '<a@x> <b@x> <orig@mail.example>' })
h = headers(split(raw).head)
ok('Cc and Bcc headers', h.cc === 'A <a@x.example>' && h.bcc === 'B <b@x.example>')
ok('reply headers keep the chain', h['in-reply-to'] === '<orig@mail.example>' && h.references === '<a@x> <b@x> <orig@mail.example>')

// ---- attachments
const bin = Uint8Array.from({ length: 256 }, (_, i) => i)
const big = new Uint8Array(100_000).map((_, i) => (i * 7) % 256)
raw = buildMime({ ...base, attachments: [{ name: 'تقرير ✓.pdf', mime: 'application/pdf', bytes: bin }, { name: 'a "q".bin', mime: 'application/octet-stream', bytes: big }] })
;({ head, body } = split(raw)); h = headers(head)
ok('multipart/mixed when there are files', h['content-type']!.startsWith('multipart/mixed'))
const mix = parts(body, bnd(h['content-type']!))
ok('alternative part first, then each file', mix.length === 3 && mix[0]!.includes('multipart/alternative'))
const f1 = split(mix[1]!); const f2 = split(mix[2]!)
ok('binary bytes survive exactly', Buffer.from(decodeB64(f1.body)).equals(Buffer.from(bin)) && Buffer.from(decodeB64(f2.body)).equals(Buffer.from(big)))
ok('non-ASCII file name uses filename* UTF-8 and an ASCII fallback', /filename\*=UTF-8''%D8%AA/.test(f1.head) && /filename="[\x20-\x7e]+"/.test(f1.head))
ok('quote in a file name cannot break the header', !/filename="[^"]*"[^;\r\n]*"/.test(f2.head.replace(/filename\*=[^\r\n]*/, '')))
ok('attachment lines are 76 wide', f2.body.split('\r\n').every((l) => l.length <= 76))

// ---- html and raw
const out = outgoingHtml('<div data-sig="1" contenteditable="false">sig</div><div data-quote="1"><hr>q</div><p>x</p>')
ok('composer markers are stripped before sending', !/data-sig|data-quote|contenteditable/.test(out) && out.includes('<p>x</p>') && out.startsWith('<!doctype html>'))
const r = toRaw('Subject: Hello?\r\n\r\n>>>???')
ok('raw is URL-safe base64 without padding', !/[+/=]/.test(r) && Buffer.from(r, 'base64url').toString() === 'Subject: Hello?\r\n\r\n>>>???')
ok('encodeHeaderText leaves short ASCII alone', encodeHeaderText('Plain subject') === 'Plain subject')


// ---- images inside the message (inline, cid:)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const withImg = `<p>Hi</p><div><img alt="logo" src="data:image/png;base64,${PNG}" width="40"><img src="https://x.example/a.png"><img src='data:image/jpeg;base64,${PNG}'></div>`
const ex = extractInlineImages(withImg)
ok('pasted pictures become inline parts, https pictures stay as they are', ex.images.length === 2 && ex.images[0]!.mime === 'image/png' && ex.images[1]!.mime === 'image/jpeg' && ex.html.includes('https://x.example/a.png'))
ok('the HTML no longer carries the picture bytes', !ex.html.includes('data:image') && ex.html.includes(`src="cid:${ex.images[0]!.cid}"`) && ex.html.includes(`src='cid:${ex.images[1]!.cid}'`))
ok('the bytes are the original picture', Buffer.from(ex.images[0]!.bytes).toString('base64') === PNG)
ok('broken base64 does not throw and drops the source', extractInlineImages('<img src="data:image/png;base64,@@@@">').images.length === 0)
ok('other data: addresses are never turned into parts', extractInlineImages('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">').images.length === 0)
raw = buildMime({ ...base, html: ex.html, inline: ex.images })
ok('a message with pictures is multipart/alternative with a multipart/related HTML', /multipart\/alternative/.test(raw) && /Content-Type: multipart\/related; boundary="/.test(raw))
ok('each picture has its Content-ID and is marked inline', ex.images.every((i) => raw.includes(`Content-ID: <${i.cid}>`)) && (raw.match(/Content-Disposition: inline/g) ?? []).length === 2)
ok('the plain-text part comes first, then the related HTML', raw.indexOf('text/plain') < raw.indexOf('multipart/related'))
ok('the picture data is in the message as base64', raw.includes(PNG.slice(0, 40)))
raw = buildMime({ ...base, attachments: [{ name: 'a.pdf', mime: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }], html: ex.html, inline: ex.images })
ok('with a file attached too: mixed outside, related inside', raw.indexOf('multipart/mixed') < raw.indexOf('multipart/related') && raw.includes('filename="a.pdf"'))
ok('without pictures nothing changes', !buildMime({ ...base }).includes('multipart/related'))


// ---- our own Message-ID (so a send that seemed to fail can be looked up before anyone repeats it)
raw = buildMime({ ...base, messageId: 'pm-123@pivotmail' })
ok('a Message-ID header is written when given, without doubled brackets', /\r\nMessage-ID: <pm-123@pivotmail>\r\n/.test(raw))
raw = buildMime({ ...base, messageId: '<pm-9@pivotmail>\r\nBcc: evil@x.example' })
ok('a Message-ID cannot be used to inject another header', !/\r\nBcc: evil/.test(raw))
ok('without one, no Message-ID is written (Gmail adds its own)', !/Message-ID/i.test(buildMime({ ...base })))

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
