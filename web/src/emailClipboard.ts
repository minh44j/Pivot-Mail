/**
 * "Copy email" keeps the rich version in memory so pasting into the composer restores the
 * formatted header block. Other apps get the normal text/html and text/plain from the system clipboard.
 */
let last: { text: string; html: string } | null = null

export function rememberCopiedEmail(text: string, html: string): void {
  last = { text, html }
}

/** Returns the rich HTML if the pasted plain text is what "Copy email" just copied. */
export function matchCopiedEmail(pastedText: string): string | null {
  if (!last) return null
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  return norm(pastedText) === norm(last.text) ? last.html : null
}
