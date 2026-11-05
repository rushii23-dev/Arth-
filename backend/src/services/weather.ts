import { ApiError } from '../errors.js'
import { dayLabel, sentenceCase, t } from '../lib/i18n.js'
import type { LangCode } from '../lib/time.js'

export type WeatherCondition = 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'heavy_rain' | 'thunderstorm' | 'fog'

export interface CurrentWeather {
  tempC: number
  feelsLikeC: number
  humidity: number
  windKmh: number
  rainProb: number
  condition: WeatherCondition
}

export interface WeatherDay {
  date: string
  minC: number
  maxC: number
  rainProb: number
  rainMm: number
  windKmh: number
  condition: WeatherCondition
}

export interface Forecast {
  current: CurrentWeather
  daily: WeatherDay[] // 7 days, today first (IST)
}

export interface Advisory {
  id: string
  severity: 'danger' | 'warning' | 'info'
  rule: 'rain_no_spray' | 'heat_irrigate' | 'wind_no_spray' | 'other'
  title: string
  detail: string
  date: string
}

export type ForecastSource = (lat: number, lon: number) => Promise<Forecast>

// ---- Open-Meteo ------------------------------------------------------------

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability'
const DAILY =
  'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max'

interface OpenMeteoResponse {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
    precipitation_probability: number | null
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: (number | null)[]
    precipitation_sum: (number | null)[]
    wind_speed_10m_max: number[]
  }
}

/** WMO weather code (+ rain amount) to the app's seven conditions. */
export function toCondition(code: number, rainMm = 0): WeatherCondition {
  if (code >= 95) return 'thunderstorm'
  if (code === 65 || code === 82 || rainMm >= 35) return 'heavy_rain'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 81)) return 'rain'
  if (code === 45 || code === 48) return 'fog'
  if (code === 2) return 'partly_cloudy'
  if (code === 3 || (code >= 71 && code <= 77) || code >= 85) return 'cloudy'
  return 'clear'
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function openMeteo(fetchFn: typeof fetch = fetch): ForecastSource {
  return async (lat, lon) => {
    const url =
      `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&current=${CURRENT}&daily=${DAILY}` +
      `&timezone=Asia%2FKolkata&forecast_days=7`
    let res: Response
    try {
      res = await fetchFn(url, { signal: AbortSignal.timeout(8000) })
    } catch {
      throw new ApiError(502, 'weather_unavailable', 'Weather service did not answer')
    }
    if (!res.ok) throw new ApiError(502, 'weather_unavailable', `Weather service error ${res.status}`)
    const j = (await res.json()) as OpenMeteoResponse
    const d = j.daily
    const daily: WeatherDay[] = d.time.map((date, i) => {
      const rainMm = r1(d.precipitation_sum[i] ?? 0)
      return {
        date,
        minC: r1(d.temperature_2m_min[i]!),
        maxC: r1(d.temperature_2m_max[i]!),
        rainProb: d.precipitation_probability_max[i] ?? 0,
        rainMm,
        windKmh: r1(d.wind_speed_10m_max[i]!),
        condition: toCondition(d.weather_code[i]!, rainMm),
      }
    })
    const c = j.current
    return {
      current: {
        tempC: r1(c.temperature_2m),
        feelsLikeC: r1(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        windKmh: r1(c.wind_speed_10m),
        rainProb: c.precipitation_probability ?? daily[0]?.rainProb ?? 0,
        condition: toCondition(c.weather_code),
      },
      daily,
    }
  }
}

/** Forecasts change slowly; one fetch per ~1 km cell per 30 minutes, with in-flight requests shared. */
export function cached(source: ForecastSource, ttlMs = 30 * 60_000, now = Date.now): ForecastSource {
  const cache = new Map<string, { at: number; value: Promise<Forecast> }>()
  return (lat, lon) => {
    const key = `${lat},${lon}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttlMs) return hit.value
    const value = source(lat, lon)
    cache.set(key, { at: now(), value })
    value.catch(() => cache.delete(key))
    if (cache.size > 5000) cache.delete(cache.keys().next().value!)
    return value
  }
}

// ---- Advisories --------------------------------------------------------------

/** Spray is unsafe when rain is likely: SPEC example "Don't spray tomorrow — 80% rain". */
export const RAIN_PROB_NO_SPRAY = 60
export const RAIN_MM_NO_SPRAY = 5
export const HEAVY_RAIN_MM = 35
/** Daily max 10 m wind; drift is a problem well before this at nozzle height. */
export const WIND_NO_SPRAY_KMH = 20
export const HEAT_C = 38
export const DANGER_HEAT_C = 42

/** Rules over the next 3 days, most urgent first. Texts are in the farmer's language. */
export function advisories(daily: WeatherDay[], lang: LangCode): Advisory[] {
  const out: Advisory[] = []
  const cap = (s: string) => (lang === 'en' ? sentenceCase(s) : s)
  daily.slice(0, 3).forEach((d, offset) => {
    const day = dayLabel(lang, d.date, offset)
    if (d.rainMm >= HEAVY_RAIN_MM || d.condition === 'heavy_rain') {
      out.push({
        id: `heavy_rain-${d.date}`,
        severity: 'danger',
        rule: 'other',
        title: cap(t(lang, 'adv.heavyRain.title', { day, mm: Math.round(d.rainMm) })),
        detail: t(lang, 'adv.heavyRain.detail'),
        date: d.date,
      })
    }
    if (d.rainProb >= RAIN_PROB_NO_SPRAY || d.rainMm >= RAIN_MM_NO_SPRAY) {
      out.push({
        id: `rain_no_spray-${d.date}`,
        severity: d.rainProb >= 80 && offset <= 1 ? 'danger' : 'warning',
        rule: 'rain_no_spray',
        title: cap(t(lang, 'adv.rain.title', { day, p: d.rainProb })),
        detail: t(lang, 'adv.rain.detail'),
        date: d.date,
      })
    } else if (d.windKmh >= WIND_NO_SPRAY_KMH) {
      out.push({
        id: `wind_no_spray-${d.date}`,
        severity: d.windKmh >= 30 ? 'danger' : 'warning',
        rule: 'wind_no_spray',
        title: cap(t(lang, 'adv.wind.title', { day, w: Math.round(d.windKmh) })),
        detail: t(lang, 'adv.wind.detail'),
        date: d.date,
      })
    }
    if (d.maxC >= HEAT_C) {
      out.push({
        id: `heat_irrigate-${d.date}`,
        severity: d.maxC >= DANGER_HEAT_C ? 'danger' : 'warning',
        rule: 'heat_irrigate',
        title: cap(t(lang, 'adv.heat.title', { day, t: Math.round(d.maxC) })),
        detail: t(lang, 'adv.heat.detail'),
        date: d.date,
      })
    }
  })
  const order = { danger: 0, warning: 1, info: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.date.localeCompare(b.date))
}

/** True when the next two days are dry and calm enough to spray. */
export const sprayWindowOpen = (daily: WeatherDay[]) =>
  daily.length >= 2 &&
  daily
    .slice(0, 2)
    .every((d) => d.rainProb < RAIN_PROB_NO_SPRAY && d.rainMm < RAIN_MM_NO_SPRAY && d.windKmh < WIND_NO_SPRAY_KMH)
