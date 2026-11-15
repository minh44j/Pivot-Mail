import type { Colour } from '../types'

/** Colour categories (Outlook-style). Will map to coloured Gmail labels so they sync. */
export const COLOURS: { id: Colour; label: string }[] = [
  { id: 'red', label: 'Urgent' },
  { id: 'orange', label: 'Action needed' },
  { id: 'yellow', label: 'Waiting' },
  { id: 'green', label: 'Confirmed' },
  { id: 'blue', label: 'Client' },
  { id: 'purple', label: 'Internal' },
]
