// Test server: the real Pivot Mail sign-in code (web/api) and the built web app (web/dist), with a pretend Google. Never used in production.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { GET, POST, PATCH } from '../../web/api/auth/index.ts'
import { GET as CONNECT_GET, POST as CONNECT_POST } from '../../web/api/accounts/connect.ts'

process.env.SESSION_SECRET = 'x'.repeat(40)
process.env.GOOGLE_CLIENT_ID_SCL = 'scl-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET_SCL = 'scl-secret'
process.env.GOOGLE_CLIENT_ID_TMC = 'tmc-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET_TMC = 'tmc-secret'
delete process.env.SUPABASE_URL
const PORT = Number(process.env.PORT ?? 4310)
const DIST = process.env.PIVOT_TEST_DIST ? path.resolve(process.env.PIVOT_TEST_DIST) : path.resolve(import.meta.dirname, '../../web/dist')

let claims: Record<string, unknown> = {}
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input)
  if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ id_token: `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s` }), { status: 200 })
  return realFetch(input, init)
}) as typeof fetch

// The live site's security headers (web/vercel.json), so the app is tested under the rules it really runs with: per page, the
// first rule whose source matches (the sealed /preview.html has its own). Leaves out the two that only make sense on https
// (this server is http://localhost).
const RULES = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../web/vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }).headers.map((r) => ({
  re: new RegExp(`^${r.source}$`),
  headers: r.headers.filter((h) => h.key !== 'Strict-Transport-Security').map((h): [string, string] => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace(/;\s*upgrade-insecure-requests/, '') : h.value]),
}))
const liveHeaders = (p: string): [string, string][] => (RULES.find((r) => r.re.test(p)) ?? RULES[0]!).headers

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    if (url.pathname === '/__test/claims') {
      claims = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      res.end('ok')
      return
    }
    if (url.pathname === '/__test/redirect') {
      res.statusCode = 302
      res.setHeader('location', 'https://example.com/landed-elsewhere')
      res.end()
      return
    }
    if (url.pathname === '/api/accounts') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ accounts: [], configured: true }))
      return
    }
    if (url.pathname.startsWith('/api/auth') || url.pathname === '/api/accounts/connect') {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const method = req.method ?? 'GET'
      const r = new Request(url.href, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks) })
      const out: Response =
        url.pathname === '/api/accounts/connect' ? (method === 'POST' ? await CONNECT_POST(r) : await CONNECT_GET(r)) : method === 'POST' ? await POST(r) : method === 'PATCH' ? await PATCH(r) : await GET(r)
      res.statusCode = out.status
      out.headers.forEach((v, k) => {
        if (k !== 'set-cookie') res.setHeader(k, v)
      })
      // On http://localhost the server leaves out "Secure"; Chromium only accepts __Host- cookies with it (localhost counts as secure).
      const cookies = out.headers.getSetCookie().map((c) => (/;\s*Secure/i.test(c) ? c : `${c}; Secure`))
      if (cookies.length) res.setHeader('set-cookie', cookies)
      res.end(Buffer.from(await out.arrayBuffer()))
      return
    }
    let file = path.join(DIST, decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    for (const [k, v] of liveHeaders(url.pathname)) res.setHeader(k, v)
    res.end(fs.readFileSync(file))
  })
  .listen(PORT, () => console.log(`test server on ${PORT}`))
