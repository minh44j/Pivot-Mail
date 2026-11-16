/** Minimal Supabase (PostgREST) client for the server. The secret key stays in Vercel and never reaches the browser. */
type Row = Record<string, unknown>

function cfg(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SECRET_KEY
  return url && key ? { url, key } : null
}

export const dbConfigured = (): boolean => cfg() !== null

async function call<T>(method: string, table: string, qs: string, body?: unknown, prefer?: string): Promise<T[]> {
  const c = cfg()
  if (!c) throw new Error('database is not configured')
  const headers: Record<string, string> = { apikey: c.key, 'content-type': 'application/json' }
  // Legacy service_role keys are JWTs and also go in Authorization; the newer secret keys use the apikey header only.
  if (c.key.startsWith('eyJ')) headers.authorization = `Bearer ${c.key}`
  if (prefer) headers.prefer = prefer
  const res = await fetch(`${c.url}/rest/v1/${table}${qs ? `?${qs}` : ''}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  // Never include the response body in errors or logs: it can contain personal data.
  if (!res.ok) throw new Error(`database ${method} ${table} failed (${res.status})`)
  const text = await res.text()
  return text ? (JSON.parse(text) as T[]) : []
}

export const eq = (v: string): string => `eq.${encodeURIComponent(v)}`
export const select = <T = Row>(table: string, qs: string) => call<T>('GET', table, qs)
export const insert = <T = Row>(table: string, rows: Row | Row[], onConflict?: string) =>
  call<T>('POST', table, onConflict ? `on_conflict=${onConflict}` : '', rows, `return=representation${onConflict ? ',resolution=merge-duplicates' : ''}`)
export const update = <T = Row>(table: string, qs: string, patch: Row) => call<T>('PATCH', table, qs, patch, 'return=representation')
export const remove = <T = Row>(table: string, qs: string) => call<T>('DELETE', table, qs, undefined, 'return=representation')

/** Calls a database function (used for the atomic case-number counter). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = cfg()
  if (!c) throw new Error('database is not configured')
  const headers: Record<string, string> = { apikey: c.key, 'content-type': 'application/json' }
  if (c.key.startsWith('eyJ')) headers.authorization = `Bearer ${c.key}`
  const res = await fetch(`${c.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  if (!res.ok) throw new Error(`database function ${fn} failed (${res.status})`)
  return (await res.json()) as T
}
