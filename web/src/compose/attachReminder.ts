/**
 * "Did you forget the attachment?" (Minhaj 2026-11-22), as Outlook and Gmail ask: the subject or the newly written text says
 * a file is attached ("attached", "PFA", "enclosed", "مرفق") but nothing is attached. The signature and the quoted earlier
 * mail are not read: "please find attached" in the mail being answered must not trigger it.
 */
const SAYS_ATTACHED = new RegExp(
  [
    String.raw`\battach(?:ed|ing|ment|ments)\b`,
    String.raw`\bp\.?f\.?a\b`,
    String.raw`\benclos(?:ed|ing|ure)\b`,
    String.raw`\bherewith\b`,
    String.raw`\bfind (?:the )?(?:below|enclosed) (?:file|document|copy)`,
    // Arabic: attached / the attachment / attachments / in the attachment
    'مرفق',
    'مرفقة',
    'المرفق',
    'مرفقات',
    'المرفقات',
    'بالمرفق',
  ].join('|'),
  'i',
)

/** Only the words the person wrote now: no signature, no quoted history. */
export function writtenText(bodyHtml: string): string {
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html')
  doc.querySelectorAll('[data-sig], [data-quote], .gmail_quote, blockquote[type="cite"]').forEach((n) => n.remove())
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function saysAttached(subject: string, bodyHtml: string): boolean {
  const s = subject.replace(/^((re|fwd?|fw)\s*:\s*)+/i, '')
  return SAYS_ATTACHED.test(s) || SAYS_ATTACHED.test(writtenText(bodyHtml))
}
