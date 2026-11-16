import type { Message } from './types'
import { escapeHtml } from './richtext'
import { sanitizeEmailHtml } from './mailhtml'

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"

const when = (iso: string): string => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const who = (p: { name: string; email: string }): string => `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;`
const kb = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

/**
 * A standalone, read-only document of one conversation, for printing, Save as PDF or a separate window.
 * Bodies are sanitised exactly like the reading pane; remote images stay blocked. No scripts run (CSP).
 */
export function buildMessageDoc(msgs: Message[], title: string): string {
  const parts = msgs.map((m) => {
    const body = m.html ? sanitizeEmailHtml(m.html, false).html : `<pre>${escapeHtml(m.body)}</pre>`
    const att = m.attachments.length > 0 ? `<p class="att"><b>Attachments:</b> ${m.attachments.map((a) => `${escapeHtml(a.name)} (${kb(a.size)})`).join(', ')}</p>` : ''
    return `<section class="m">
<table class="h">
<tr><th>From</th><td>${who(m.from)}</td></tr>
<tr><th>To</th><td>${m.to.map(who).join(', ') || '—'}</td></tr>
${m.cc && m.cc.length > 0 ? `<tr><th>Cc</th><td>${m.cc.map(who).join(', ')}</td></tr>` : ''}
<tr><th>Date</th><td>${escapeHtml(when(m.date))}</td></tr>
<tr><th>Subject</th><td>${escapeHtml(m.subject)}</td></tr>
</table>${att}<div class="b">${body}</div></section>`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escapeHtml(title)}</title><style>
body{margin:0;padding:28px 36px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6e6e73;font-size:12px;margin:0 0 18px}
.m{padding:14px 0;border-top:1px solid #d2d2d7;page-break-inside:avoid-page}
.h{border-collapse:collapse;font-size:13px;margin-bottom:10px}.h th{text-align:left;color:#6e6e73;font-weight:500;padding:1px 14px 1px 0;vertical-align:top}.h td{padding:1px 0}
.att{font-size:12px;color:#515154}pre{white-space:pre-wrap;font:inherit;margin:0}
.b{overflow-wrap:anywhere}.b img{max-width:100%}.b table{max-width:100%}.blocked-img{border:1px dashed #b0b0b8;padding:1px 6px;font-size:12px;color:#6e6e73}
@media print{body{padding:0}}
</style></head><body><h1>${escapeHtml(title)}</h1><p class="sub">Pivot Mail · ${msgs.length} message${msgs.length === 1 ? '' : 's'}</p>${parts.join('')}</body></html>`
}
