import { COMPANIES, clientFor, companyForHost, isConfigured } from '../_lib/config.js'
import { hostOf, json } from '../_lib/http.js'

/** Tells the sign-in screen whether real sign-in exists here, and which company this address belongs to. */
export function GET(req: Request): Response {
  const host = hostOf(req)
  if (!host) return json({ configured: false })
  const company = companyForHost(host)
  return json({
    configured: isConfigured(),
    // On an address that belongs to one company the choice is made for the person.
    company: company ? company.id : null,
    companies: Object.values(COMPANIES)
      .filter((c) => clientFor(c.id) !== null)
      .map((c) => ({ id: c.id, name: c.name, domain: c.domain })),
  })
}
