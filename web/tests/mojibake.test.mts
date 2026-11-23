// Garbled characters (Minhaj 2026-11-23: a proposal to VA TECH WABAG showed "youâ€™re" and "Managementâ€™s").
import { fixMojibake, fixMojibakeHtml, looksUtf8 } from '../src/mojibake'
import { extractBodies } from '../src/gmail/mime'

let pass = 0
let fail = 0
const ok = (n: string, c: boolean, d?: unknown) => {
  if (c) pass++
  else fail++
  console.log((c ? 'PASS ' : 'FAIL ') + n + (c || d === undefined ? '' : '  -> ' + JSON.stringify(d)))
}

// ---- repair of text that is already garbled (pasted or about to be sent)
const real = "I hope youâ€™re doing well. Please find attached Pivot Travel Managementâ€™s business proposal for VA TECH WABAGâ€™s team."
const r = fixMojibake(real)
ok('the real mail: every â€™ becomes ’ (3 repairs)', r.text === "I hope you’re doing well. Please find attached Pivot Travel Management’s business proposal for VA TECH WABAG’s team." && r.fixed === 3, r)
const cases: [string, string][] = [
  ['â€œQuoteâ€\u009d', '“Quote”'],
  ['9â€“5 and wait â€” then â€¦', '9–5 and wait — then …'],
  ['RÃ©sumÃ© Ã\u00a0 Paris', 'Résumé à Paris'], // à is C3 A0: shown as Ã and a no-break space
  ['Ù…Ø±Ø­Ø¨Ø§', 'مرحبا'],
  ['priceÂ 100', 'price 100'],
  ['â‚¬100', '€100'],
]
for (const [bad, good] of cases) ok(`"${bad}" → "${good}"`, fixMojibake(bad).text === good, fixMojibake(bad).text)
// ---- and never "repairs" ordinary text
const fine = ['Café au lait', 'São Paulo', 'naïve Müller', '€100 and ©2026 Pivot', 'مرحبا بكم في بيفوت', 'Ã alone', 'plain ASCII text', 'Ångström', 'Œuvre', '£50 — “quoted” – ok…']
for (const t of fine) ok(`left alone: "${t}"`, fixMojibake(t).text === t && fixMojibake(t).fixed === 0, fixMojibake(t))
// ---- HTML: text only
const h = fixMojibakeHtml('<p title="youâ€™re">youâ€™re <a href="https://x.example/â€™">here</a></p>')
ok('HTML: the text is repaired, tags and attributes are not', h.html === '<p title="youâ€™re">you’re <a href="https://x.example/â€™">here</a></p>' && h.fixed === 1, h)

// ---- reading a mail labelled Western whose text is really UTF-8
const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const part = (charset: string, data: string) => ({ mimeType: 'text/html', headers: [{ name: 'Content-Type', value: `text/html; charset="${charset}"` }], body: { data } })
for (const cs of ['windows-1252', 'us-ascii', 'iso-8859-1']) {
  const got = extractBodies(part(cs, enc('<p>you’re — “ok” é</p>'))).html
  ok(`UTF-8 text labelled ${cs} is read as UTF-8`, got === '<p>you’re — “ok” é</p>', got)
}
const cp1252 = Buffer.from([0x79, 0x6f, 0x75, 0x92, 0x72, 0x65, 0x20, 0x43, 0x61, 0x66, 0xe9]).toString('base64url') // you’re Café in real cp1252
ok('real Western text is still read as Western', extractBodies(part('windows-1252', cp1252)).html === 'you’re Café', extractBodies(part('windows-1252', cp1252)).html)
ok('plain ASCII is not UTF-8-looking (nothing to change)', !looksUtf8(new TextEncoder().encode('hello')))

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
