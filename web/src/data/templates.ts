export interface Template {
  id: string
  category: 'Quotes' | 'Client onboarding' | 'Marketing' | 'Follow-up'
  name: string
  subject: string
  body: string
}

/**
 * Starter templates. Amounts, dates and terms are bracketed placeholders:
 * staff must fill them in. Shared templates will be admin-managed (Phase 1 DB).
 */
export const TEMPLATES: Template[] = [
  {
    id: 'quote-freight',
    category: 'Quotes',
    name: 'Freight quotation',
    subject: 'Freight quotation – {{route}}',
    body: `Dear {{client}},

Thank you for your enquiry. Please find our quotation below.

Route: {{route}}
Cargo: [cargo description / container type / weight / CBM]
Incoterm: [Incoterms 2020 term and named place]
Rate: [currency] [amount] per [unit]
Validity: [date] (subject to space and equipment availability)
Exclusions: [duties, taxes, demurrage, detention, etc.]

Kindly confirm to proceed and we will arrange the booking.

Best regards,
{{sender}}`,
  },
  {
    id: 'quote-travel',
    category: 'Quotes',
    name: 'Travel quotation',
    subject: 'Travel quotation – {{route}}',
    body: `Dear {{client}},

Please find the travel options requested.

Itinerary: {{route}}
Travel dates: [dates]
Passengers: [number / names as per passport]
Fare: [currency] [amount] per passenger
Fare conditions: [baggage, change and refund rules]
Valid until: [date and time] (fares are not guaranteed until ticketed)

Please confirm passenger details exactly as in the passports so we can proceed.

Best regards,
{{sender}}`,
  },
  {
    id: 'onboard-welcome',
    category: 'Client onboarding',
    name: 'Welcome and documents request',
    subject: 'Welcome to Pivot – documents required',
    body: `Dear {{client}},

Welcome, and thank you for choosing us. To complete your account setup, please send:

1. Company registration / trade licence
2. Tax registration certificate
3. Authorised signatory ID
4. Contact person and billing contact details
5. [Any service-specific documents]

Once received, we will confirm your account and your point of contact.

Best regards,
{{sender}}`,
  },
  {
    id: 'marketing-intro',
    category: 'Marketing',
    name: 'Service introduction',
    subject: 'Introducing our services',
    body: `Dear {{client}},

I am {{sender}}. I am writing to introduce our services and how we can support your business:

• [Service 1]
• [Service 2]
• [Service 3]

I would welcome a short call to understand your requirements. Please let me know a convenient time.

Best regards,
{{sender}}`,
  },
  {
    id: 'followup-quote',
    category: 'Follow-up',
    name: 'Quotation follow-up',
    subject: 'Follow-up: {{subject}}',
    body: `Dear {{client}},

I am following up on our quotation sent on [date]. Please let me know if you would like to proceed, or if any adjustment is needed.

Please note the quotation is valid until [date].

Best regards,
{{sender}}`,
  },
  {
    id: 'followup-docs',
    category: 'Follow-up',
    name: 'Pending documents reminder',
    subject: 'Reminder: pending documents',
    body: `Dear {{client}},

This is a reminder that we are still waiting for the following documents:

• [document 1]
• [document 2]

Please send them at your earliest convenience so we can avoid any delay.

Best regards,
{{sender}}`,
  },
]

export function applyTemplate(t: Template, vars: Record<string, string>): { subject: string; body: string } {
  const fill = (s: string): string => s.replace(/\{\{(\w+)\}\}/g, (_whole, key: string) => vars[key] || `[${key}]`)
  return { subject: fill(t.subject), body: fill(t.body) }
}
