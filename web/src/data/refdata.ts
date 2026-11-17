/**
 * MOCK reference data for the Reference Generator preview.
 * Real client master, port list and salespeople come from Pivot OS later.
 * All names here are fictional.
 */
export type Scope = 'freight-clearance' | 'freight' | 'clearance'
export type Mode = 'sea' | 'air' | 'land'

export const SCOPES: { id: Scope; label: string; text: string; icon: 'ship' | 'boxes' | 'clearance'; tone: string }[] = [
  { id: 'freight-clearance', label: 'Freight + clearance', text: 'Shipping, customs and related operations', icon: 'ship', tone: 'blue' },
  { id: 'freight', label: 'Freight only', text: 'Only freight operations', icon: 'boxes', tone: 'purple' },
  { id: 'clearance', label: 'Clearance only', text: 'Only customs clearance', icon: 'clearance', tone: 'green' },
]

export const MODES: { id: Mode; label: string; icon: 'ship' | 'plane' | 'truck'; tone: string }[] = [
  { id: 'sea', label: 'Sea', icon: 'ship', tone: 'blue' },
  { id: 'air', label: 'Air', icon: 'plane', tone: 'teal' },
  { id: 'land', label: 'Land', icon: 'truck', tone: 'red' },
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

/** Pivot Travel Management case form (mock client list; real master comes from Pivot OS). */
export type TravelCategory = 'flight' | 'hotel' | 'visa' | 'chauffeur' | 'other'

export const TRAVEL_CATEGORIES: { id: TravelCategory; label: string; text: string; icon: 'plane' | 'passport' | 'hotel' | 'car' | 'sparkle'; tone: string }[] = [
  { id: 'flight', label: 'Flight', text: 'Tickets and changes', icon: 'plane', tone: 'blue' },
  { id: 'hotel', label: 'Hotel', text: 'Stays and rooms', icon: 'hotel', tone: 'purple' },
  { id: 'visa', label: 'Visa', text: 'Applications', icon: 'passport', tone: 'green' },
  { id: 'chauffeur', label: 'Chauffeur', text: 'Cars and drivers', icon: 'car', tone: 'orange' },
  { id: 'other', label: 'Other', text: 'Anything else', icon: 'sparkle', tone: 'gray' },
]

export const TRAVEL_CLIENTS = ['Horizon Corporate Travel', 'Meridian Holdings', 'Al Noor Family Office', 'Sunrise Events FZ-LLC', 'Pinnacle Consulting']
