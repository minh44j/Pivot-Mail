// The local mail database on its own (no window): search accuracy for shipping references, upgrades, size and speed.
// Run: npm run build && ELECTRON_RUN_AS_NODE=1 npx electron test/store.test.cjs
const { MailStore } = require('../dist/store.js')
const { DatabaseSync } = require('node:sqlite')
// (the light/complete checks below rely on these being stored as fully fetched messages: loaded: true)
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

let pass = 0, fail = 0
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || !extra ? '' : `  → ${extra}`)) }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-store-'))
const file = path.join(dir, 'mail.db')
const s = new MailStore(file)
let n = 0
const msg = (subject, body, extra = {}) => ({ id: 'm' + ++n, threadId: 't' + n, accountId: 'A', folder: 'inbox', labels: [], from: { name: 'Ops', email: 'ops@carrier.example' }, to: [], subject, body, date: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(), unread: false, flagged: false, attachments: [], loaded: true, ...extra })

const M = {
  spaced: msg('Arrival notice', 'Container MSKU 765432-1 discharged at Jeddah Islamic Port.'),
  joined: msg('Gate out MSCU1234567', 'Full container gated out.'),
  bl: msg('Draft BL for approval', 'B/L No.: MEDU J5678901 — please confirm shipper details.'),
  booking: msg('Booking confirmed [PS2690002]', 'Your booking is confirmed.'),
  invoice: msg('Invoice INV/2026/0045', 'Please find our invoice attached.', { attachments: [{ name: 'INV-2026-0045.pdf' }] }),
  arabic: msg('إشعار وصول الشحنة', 'وصلت الشحنة إلى ميناء جدة الإسلامي'),
  accents: msg('Réservation confirmée', 'Café Société, Montréal'),
  awb: msg('AWB 176-12345675 departed', 'Flight EK 9876 departed DXB.'),
  hs: msg('Customs query', 'HS code 8471.30.00 classification needed'),
  person: msg('Quote', 'Rates attached', { from: { name: 'Hana Okafor', email: 'hana@gulf-freight.example' } }),
}
s.save(Object.values(M))
const q = (text, acc = ['A']) => s.search(acc, text).map((m) => m.id)
const finds = (name, text, target) => { const r = q(text); ok(`${name}: "${text}"`, r.includes(target.id), JSON.stringify(r)) }

console.log('-- container numbers, written and typed in different ways')
finds('typed joined, written with space and dash', 'MSKU7654321', M.spaced)
finds('typed as written', 'MSKU 765432-1', M.spaced)
finds('typed with a space', 'MSKU 7654321', M.spaced)
finds('lower case', 'msku7654321', M.spaced)
finds('start only', 'MSKU76543', M.spaced)
finds('joined in the mail, typed with a space', 'MSCU 1234567', M.joined)
finds('number alone, joined in the mail', '1234567', M.joined)
finds('number alone, spaced in the mail', '765432', M.spaced)
console.log('-- B/L, booking, invoice, AWB, HS code')
finds('B/L joined', 'MEDUJ5678901', M.bl)
finds('B/L as written', 'MEDU J5678901', M.bl)
finds('booking in brackets', 'PS2690002', M.booking)
finds('booking start', 'PS269', M.booking)
finds('invoice with slashes', 'INV/2026/0045', M.invoice)
finds('invoice with dashes (file name)', 'INV-2026-0045', M.invoice)
finds('invoice joined', 'INV20260045', M.invoice)
finds('AWB with dash', '176-12345675', M.awb)
finds('AWB joined', '17612345675', M.awb)
finds('HS code dotted', '8471.30.00', M.hs)
finds('HS code joined', '84713000', M.hs)
console.log('-- words, people, languages')
finds('word start', 'jedd', M.spaced)
finds('two words, any order', 'port jeddah', M.spaced)
finds('sender name', 'okafor', M.person)
finds('sender address part', 'gulf-freight', M.person)
finds('attachment name', 'INV-2026-0045.pdf', M.invoice)
finds('Arabic word', 'الشحنة', M.arabic)
finds('Arabic word start', 'ميناء', M.arabic)
finds('accents ignored', 'reservation confirmee', M.accents)
ok('no false match: words that are not all present', q('jeddah invoice').length === 0, JSON.stringify(q('jeddah invoice')))
ok('no false match: a different container', q('MSKU7654329').length === 0, JSON.stringify(q('MSKU7654329')))
const none = (t) => s.search(['A'], t).length === 0
ok('Gmail search words are left to Gmail (no local guess): from:, has:, -word, OR', none('from:ops invoice') && none('invoice -jeddah') && none('jeddah OR invoice') && none('has:attachment invoice') && none('{jeddah invoice}'))
finds('a dash on its own is just a separator', 'arrival - notice', M.spaced)
finds('punctuation such as "B/L #" is ignored', 'B/L #  MEDUJ5678901', M.bl)
ok('a NUL or control character in the box is harmless', (() => { try { return s.search(['A'], 'jeddah\u0000\u0007').length === 1 } catch { return false } })())
ok('search results are light copies too (the full message comes when opened)', s.search(['A'], 'jeddah')[0].loaded === false && !('html' in s.search(['A'], 'jeddah')[0]))
ok('opening a conversation gives the complete stored messages', s.thread('A', M.spaced.threadId)[0].body.includes('Islamic Port') && s.thread('A', M.spaced.threadId)[0].loaded === true)
ok('other mailboxes are not searched', s.search(['B'], 'MSKU7654321').length === 0)
const weird = ['"', '*', 'NEAR(a b)', 'refs:x', 'a OR b', '^', '()', 'AND', 'NOT', '-', '\\', "'", '%', '_', 'subject:"x"', 'x'.repeat(400)]
let threw = null
for (const w of weird) { try { s.search(['A'], w) } catch (e) { threw = w + ' → ' + e.message } }
ok('no typed text can break the search (quotes, brackets, operators, very long)', threw === null, threw)

console.log('-- wipe')
{
  const wf = path.join(dir, 'wipe.db'); const w = new MailStore(wf)
  w.save([msg('Secret quotation SECRET-998877', 'confidential body text ZETA-55')])
  w.clearAll(); w.close()
  const bytes = Buffer.concat([wf, wf + '-wal'].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f))).toString('latin1')
  ok('after "forget this device" the deleted mail is not readable anywhere in the files on disk', !bytes.includes('SECRET-998877') && !bytes.includes('ZETA-55'))
}
console.log('-- upgrade of an older database file')
s.close()
{
  const raw = new DatabaseSync(file)
  raw.exec('DROP TABLE search_index; CREATE VIRTUAL TABLE search_index USING fts5(subject, people, body); PRAGMA user_version = 0;')
  raw.close()
}
const s2 = new MailStore(file)
ok('an older file is re-indexed on start, nothing lost', s2.count('A') === Object.keys(M).length && s2.search(['A'], 'MSKU7654321').length === 1)
s2.close()

console.log('-- size and speed at a busy mailbox (50,000 messages)')
const big = new MailStore(path.join(dir, 'big.db'))
const words = ['invoice', 'container', 'booking', 'customs', 'clearance', 'freight', 'Dammam', 'Riyadh', 'quotation', 'manifest', 'delivery', 'vessel']
const lorem = 'please find the details below and confirm at your earliest convenience regarding the shipment schedule and documents '.repeat(8)
let t0 = Date.now()
for (let b = 0; b < 500; b++) {
  const batch = []
  for (let i = 0; i < 100; i++) {
    const k = b * 100 + i
    batch.push({ id: 'b' + k, threadId: 'b' + k, accountId: 'BIG', folder: 'inbox', labels: [], from: { name: 'Sender ' + (k % 300), email: `s${k % 300}@example.com` }, to: [{ name: 'Ops', email: 'ops@pivotscl.com' }], subject: `${words[k % 12]} MSKU${String(1000000 + k)} PS${2600000 + k}`, body: `${words[(k * 7) % 12]} ref PSC-${100000 + k} ${lorem}`, snippet: lorem.slice(0, 100), date: new Date(Date.UTC(2024, 0, 1) + k * 1800_000).toISOString(), unread: false, flagged: false, attachments: [], loaded: k % 3 === 0 })
  }
  big.save(batch)
}
const saveAll = Date.now() - t0
const per100 = saveAll / 500
const time = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [Number(process.hrtime.bigint() - t) / 1e6, r] }
const [tExact, r1] = time(() => big.search(['BIG'], 'MSKU1043210'))
const [tSpaced, r2] = time(() => big.search(['BIG'], 'MSKU 1043210'))
const [tWord, r3] = time(() => big.search(['BIG'], 'customs'))
const [tTwo, r4] = time(() => big.search(['BIG'], 'customs manifest'))
const [tLoad, r5] = time(() => big.load('BIG'))
const sizeMb = fs.statSync(path.join(dir, 'big.db')).size / 1e6 + (fs.existsSync(path.join(dir, 'big.db-wal')) ? fs.statSync(path.join(dir, 'big.db-wal')).size / 1e6 : 0)
console.log(`   save: ${per100.toFixed(1)} ms per 100 messages; search exact ${tExact.toFixed(1)} ms, spaced ${tSpaced.toFixed(1)} ms, one word ${tWord.toFixed(1)} ms, two words ${tTwo.toFixed(1)} ms; open 5,000 newest ${tLoad.toFixed(0)} ms; file ${sizeMb.toFixed(0)} MB`)
// Saving runs on the database's own thread (store-worker.ts), so this is throughput, not a pause in the window.
ok('a batch of 100 new messages is stored in under 300 ms on its own thread (a 3,000-message sync in under 10 s)', per100 < 300, per100)
ok('reference search over 50,000 messages: exactly the right message, under 100 ms (feels instant)', r1.length === 1 && r1[0].id === 'b43210' && r2.length === 1 && r2[0].id === 'b43210' && tExact < 100 && tSpaced < 100, JSON.stringify([r1.map((m) => m.id), r2.map((m) => m.id), tExact, tSpaced]))
ok('broad word search over 50,000 messages: newest 300 in under 100 ms', r3.length === 300 && r4.length > 0 && tWord < 100 && tTwo < 100, `${r3.length} ${r4.length} ${tWord} ${tTwo}`)
ok('opening the app: the newest 5,000 messages load in under 400 ms', r5.length === 5000 && tLoad < 400, tLoad)
big.close()
fs.rmSync(dir, { recursive: true, force: true })
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
