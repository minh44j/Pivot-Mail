/**
 * Current temperature for the top bar. Only a city name goes out (Open-Meteo, no key, nothing about the person).
 * ⚠️ Open-Meteo's free service is for non-commercial use: check their terms or take a paid plan before relying on it.
 */
export interface Weather {
  temp: number
  kind: 'sun' | 'moon' | 'cloud' | 'rain' | 'storm' | 'fog'
}

const KEY = 'pm.weather'

interface Cached {
  city: string
  at: number
  value: Weather
  lat: number
  lon: number
}

const read = (): Cached | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Cached | null
    return v && typeof v.city === 'string' && typeof v.at === 'number' ? v : null
  } catch {
    return null
  }
}

const kindOf = (code: number, day: boolean): Weather['kind'] => {
  if (code === 0 || code === 1) return day ? 'sun' : 'moon'
  if (code === 2 || code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 95) return 'storm'
  if (code >= 51) return 'rain'
  return 'cloud'
}

/** Cached for 30 minutes per city. Returns null when the city is unknown or the service cannot be reached. */
export async function fetchWeather(city: string): Promise<Weather | null> {
  const name = city.trim()
  if (!name) return null
  const cached = read()
  if (cached && cached.city.toLowerCase() === name.toLowerCase() && Date.now() - cached.at < 30 * 60_000) return cached.value
  try {
    let lat = cached && cached.city.toLowerCase() === name.toLowerCase() ? cached.lat : NaN
    let lon = cached && cached.city.toLowerCase() === name.toLowerCase() ? cached.lon : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`)
      if (!g.ok) return null
      const hit = ((await g.json()) as { results?: { latitude: number; longitude: number }[] }).results?.[0]
      if (!hit) return null
      lat = hit.latitude
      lon = hit.longitude
    }
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`)
    if (!r.ok) return null
    const c = ((await r.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } }).current
    if (!c) return null
    const value: Weather = { temp: Math.round(c.temperature_2m), kind: kindOf(c.weather_code, c.is_day === 1) }
    try {
      localStorage.setItem(KEY, JSON.stringify({ city: name, at: Date.now(), value, lat, lon } satisfies Cached))
    } catch {
      /* storage may be blocked: the result is still shown */
    }
    return value
  } catch {
    return null
  }
}
