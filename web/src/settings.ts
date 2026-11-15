import { createContext, useContext } from 'react'
import type { Colour } from './types'
import { COLOURS } from './data/colours'
import { TEMPLATES } from './data/templates'
import type { Template } from './data/templates'

/** What the rest of the app reads: merged templates and (renamed) colour categories. */
export interface SettingsValue {
  templates: Template[]
  colours: { id: Colour; label: string }[]
}

export const SettingsContext = createContext<SettingsValue>({ templates: TEMPLATES, colours: COLOURS })

export function useSettings(): SettingsValue {
  return useContext(SettingsContext)
}

export function mergeColours(names: Partial<Record<Colour, string>>): { id: Colour; label: string }[] {
  return COLOURS.map((c) => ({ id: c.id, label: names[c.id]?.trim() || c.label }))
}
