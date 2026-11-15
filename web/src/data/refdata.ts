/**
 * MOCK reference data for the Reference Generator preview.
 * Real client master, port list and salespeople come from Pivot OS later.
 * All names here are fictional.
 */
export type Scope = 'freight-clearance' | 'freight' | 'clearance'
export type Mode = 'sea' | 'air' | 'land'

export const SCOPES: { id: Scope; label: string }[] = [
  { id: 'freight-clearance', label: 'Freight + clearance' },
  { id: 'freight', label: 'Freight only' },
  { id: 'clearance', label: 'Clearance only' },
]

export const MODES: { id: Mode; label: string }[] = [
  { id: 'sea', label: 'Sea' },
  { id: 'air', label: 'Air' },
  { id: 'land', label: 'Land' },
]

export const CLIENTS = [
  'Acme Trading LLC',
  'Bluewave Lines',
  'Gulf Cargo Services',
  'Horizon Corporate Travel',
  'Northgate Industrial',
  'Orchid Foods FZE',
  'Sunrise Textiles',
  'Vertex Machinery Co',
]

/** ⚠️ Mock lists. The real Pivot OS standard port/airport names replace these. */
export const PLACES: Record<Mode, string[]> = {
  sea: ['Jebel Ali', 'Khalifa Port', 'Mundra', 'Nhava Sheva', 'Chennai', 'Cochin', 'Colombo', 'Karachi', 'Jeddah', 'Dammam', 'Mombasa', 'Singapore', 'Port Klang', 'Shanghai', 'Ningbo', 'Rotterdam', 'Hamburg', 'Antwerp', 'Felixstowe', 'Los Angeles'],
  air: ['Dubai (DXB)', 'Abu Dhabi (AUH)', 'Delhi (DEL)', 'Mumbai (BOM)', 'Cochin (COK)', 'Doha (DOH)', 'Riyadh (RUH)', 'Frankfurt (FRA)', 'London Heathrow (LHR)', 'Singapore Changi (SIN)', 'Hong Kong (HKG)'],
  land: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Riyadh', 'Dammam', 'Muscat', 'Kuwait City', 'Doha', 'Manama'],
}

export const SALESPEOPLE = [
  { id: 'amir', name: 'Amir' },
  { id: 'bina', name: 'Bina' },
  { id: 'carlos', name: 'Carlos' },
  { id: 'dana', name: 'Dana' },
  { id: 'elif', name: 'Elif' },
  { id: 'farid', name: 'Farid' },
  { id: 'gita', name: 'Gita' },
  { id: 'hugo', name: 'Hugo' },
]
