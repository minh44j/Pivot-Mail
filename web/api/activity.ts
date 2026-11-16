import { dbConfigured, eq, insert, rpc, select } from './_lib/db.js'
import { hostOf, json, originOf } from './_lib/http.js'
import { currentUser } from './_lib/session.js'

/**
 * Activity for the administrator's performance page.
 *  POST {kind:'heartbeat'}                       one active minute (server time)
 *  POST {kind:'stats', stats:[{accountId,day,sent,received}]}   mail counts the person's browser measured in Gmail
 *  GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City   administrators only: one row per person per day
 * Mail counts are reported by the person's own browser, so they are advisory: a determined person could change their own numbers.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const err = (code: string, status: number) => json({ error: code }, status)

function validTz(tz: string | null): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

const dayNum = (s: string): number => Date.parse(`${s}T00:00:00Z`)

export async function GET(req: Request): Promise<Response> {
  const host = hostOf(req)
  if (!host || !dbConfigured()) return err('config', 503)
  try {
    const me = await currentUser(req)
    if (!me) return err('session', 401)
    if (me.role !== 'admin') return err('forbidden', 403)
    const q = new URL(req.url).searchParams
    const from = q.get('from') ?? ''
    const to = q.get('to') ?? ''
    if (!DAY.test(from) || !DAY.test(to) || dayNum(to) < dayNum(from) || dayNum(to) - dayNum(from) > 120 * 86_400_000) return err('invalid', 400)
    const rows = await rpc<Record<string, unknown>[]>('performance_report', { p_from: from, p_to: to, p_tz: validTz(q.get('tz')) })
    return json({ rows })
  } catch {
    return err('unavailable', 503)
  }
}

export async function POST(req: Request): Promise<Response> {
  const host = hostOf(req)
  if (!host || !dbConfigured()) return err('config', 503)
  if (req.headers.get('origin') !== originOf(host)) return err('forbidden', 403)
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return err('session', 401)

    if (b.kind === 'heartbeat') {
      const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
      await insert('activity_minutes', { user_id: me.id, minute }, 'user_id,minute')
      return json({ ok: true })
    }

    if (b.kind === 'stats' && Array.isArray(b.stats)) {
      const today = Date.now()
      let saved = 0
      for (const s of b.stats.slice(0, 40) as Record<string, unknown>[]) {
        const day = typeof s.day === 'string' ? s.day : ''
        const sent = Number(s.sent)
        const received = Number(s.received)
        const accountId = typeof s.accountId === 'string' ? s.accountId : ''
        if (!DAY.test(day) || !/^[0-9a-f-]{36}$/i.test(accountId)) continue
        // Not in the future and not older than 35 days.
        if (dayNum(day) > today + 86_400_000 || dayNum(day) < today - 35 * 86_400_000) continue
        if (![sent, received].every((n) => Number.isInteger(n) && n >= 0 && n <= 100_000)) continue
        // Only the person's own personal mailboxes count towards their numbers.
        const access = await select('mailbox_access', `user_id=${eq(me.id)}&account_id=${eq(accountId)}&select=account_id`)
        const acc = (await select<{ kind: string }>('mail_accounts', `id=${eq(accountId)}&select=kind`))[0]
        if (access.length === 0 || acc?.kind !== 'personal') continue
        await insert('daily_mail_stats', { user_id: me.id, account_id: accountId, day, sent, received, reported_at: new Date().toISOString() }, 'user_id,account_id,day')
        saved++
      }
      return json({ ok: true, saved })
    }
    return err('invalid', 400)
  } catch {
    return err('unavailable', 503)
  }
}
