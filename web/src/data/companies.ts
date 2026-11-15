/** The two Workspaces Pivot Mail accepts. Each will have its own Internal Google Cloud project and OAuth Client ID. */
export const COMPANIES = [
  { id: 'tmc', name: 'Pivot Travel Management', domain: 'pivottmc.com' },
  { id: 'scl', name: 'Pivot Shipping', domain: 'pivotscl.com' },
] as const

export type CompanyId = (typeof COMPANIES)[number]['id']
