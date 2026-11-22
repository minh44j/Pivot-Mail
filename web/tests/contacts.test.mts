// Contacts for the To box and @-mentions (2026-11-22): the person's own, never the sample people once signed in.
import { contactsFromMail, mergeContacts, setContactPool, suggestContacts, displayName } from '../src/data/contacts'

let pass = 0, fail = 0
const ok = (n: string, c: boolean, d?: unknown) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || d === undefined ? '' : '  -> ' + JSON.stringify(d))) }
const NOW = Date.parse('2026-11-22T08:00:00Z')
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const P = (name: string, email: string) => ({ name, email })
const ME = 'minhaj@pivottmc.com'
const mail = [
  { folder: 'sent', from: P('Minhaj', ME), to: [P('Mohammed Kaiser', 'mohammed.kaiser@zaer.sa')], cc: [P('MR', 'mr@pivottmc.com')], date: day(1) },
  { folder: 'sent', from: P('Minhaj', ME), to: [P('', 'Mohammed.Kaiser@zaer.sa')], date: day(2) },
  { folder: 'inbox', from: P('Mohammed Kaiser', 'mohammed.kaiser@zaer.sa'), to: [P('Minhaj', ME)], date: day(1) },
  { folder: 'inbox', from: P('Old Vendor', 'old@vendor.example.com'), to: [P('Minhaj', ME)], date: day(400) },
  { folder: 'inbox', from: P('Booking', 'booking@limousina.net'), to: [P('Minhaj', ME)], date: day(3) },
  { folder: 'inbox', from: P('ChatGPT', 'noreply@tm.openai.com'), to: [P('Minhaj', ME)], date: day(1) },
  { folder: 'inbox', from: P('Google', 'calendar-notification@google.com'), to: [P('Minhaj', ME)], date: day(1) },
  { folder: 'inbox', from: P('Minhaj', 'MINHAJ@pivottmc.com'), to: [], date: day(1) },
  { folder: 'inbox', from: P('broken', 'not-an-address'), to: [], date: day(1) },
]
const list = contactsFromMail(mail, [ME], NOW)
const emails = list.map((c) => c.email.toLowerCase())
ok('the person written to most and most recently comes first', emails[0] === 'mohammed.kaiser@zaer.sa', emails)
ok('one entry per address, whatever its capitals', emails.filter((e) => e === 'mohammed.kaiser@zaer.sa').length === 1)
ok('...with the real name (not the address) kept', list[0]?.name === 'Mohammed Kaiser', list[0])
ok('recent mail ranks above year-old mail', emails.indexOf('booking@limousina.net') < emails.indexOf('old@vendor.example.com'), emails)
ok('the person\'s own address is not suggested', !emails.includes(ME))
ok('automatic senders (no-reply, calendar notifications) are left out', !emails.some((e) => e.startsWith('noreply@') || e.startsWith('calendar-notification@')), emails)
ok('things that are not addresses are left out', !emails.includes('not-an-address'))
ok('a nameless address gets a readable name (the part before @)', contactsFromMail([{ folder: 'inbox', from: P('', 'ops@pivotscl.com'), to: [], date: day(1) }], [], NOW)[0]?.name === 'ops')

const merged = mergeContacts(list, [{ name: 'Mohammed K. (directory)', email: 'MOHAMMED.KAISER@zaer.sa' }, { name: 'Sara Colleague', email: 'sara@pivottmc.com' }])
ok('directory people are added after mail people, without repeats', merged.filter((c) => c.email.toLowerCase() === 'mohammed.kaiser@zaer.sa').length === 1 && merged.at(-1)?.email === 'sara@pivottmc.com')

// the regression: signed in, the To box suggested made-up sample people
setContactPool(merged)
const s = suggestContacts('kai', [])
ok('typing "kai" suggests the real Mohammed Kaiser', s[0]?.email === 'mohammed.kaiser@zaer.sa', s)
ok('no sample (made-up) people once signed in', suggestContacts('hana', []).length === 0 && suggestContacts('', [], 50).every((c) => !c.email.endsWith('.example') || c.email === 'old@vendor.example.com'))
ok('display names come from the real list', displayName('sara@pivottmc.com') === 'Sara Colleague')
setContactPool(null)
ok('signed out (demo): the sample list is back', suggestContacts('hana', [])[0]?.name === 'Hana Okafor')

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
