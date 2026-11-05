import { sentenceCase, t } from '../lib/i18n.js'
import { daysBetween, istDate, type Clock, type LangCode } from '../lib/time.js'
import type { FarmerProfile } from '../schemas.js'
import { seasonNow, seasonOn } from './seasons.js'
import { advisories, sprayWindowOpen, type Advisory, type ForecastSource } from './weather.js'

type Priority = 'high' | 'medium' | 'low'

export interface ActionItem {
  id: string
  type: 'spray' | 'irrigate' | 'harvest' | 'sell' | 'sow' | 'protect' | 'scheme'
  priority: Priority
  title: string
  detail: string
  source: 'weather' | 'mandi' | 'calendar'
  route: string | null
}

export interface ToolCallLog {
  name: string
  args: Record<string, unknown>
  ms: number
}

/** Days into a season during which the brief nudges the farmer to plan sowing. */
const SOWING_NUDGE_DAYS = 45
const MAX_ACTIONS = 3

/** Runs a step and records it, so judges can see on About what fed the brief. */
async function logged<T>(log: ToolCallLog[], name: string, args: Record<string, unknown>, fn: () => Promise<T>) {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    log.push({ name, args, ms: Math.round(performance.now() - start) })
  }
}

function fromAdvisory(a: Advisory, today: string): ActionItem {
  const soon = daysBetween(today, a.date) <= 1
  const base = { id: a.id, title: a.title, detail: a.detail, source: 'weather' as const, route: '/weather' }
  switch (a.rule) {
    case 'rain_no_spray':
    case 'wind_no_spray':
      return { ...base, type: 'spray', priority: soon ? 'high' : 'medium' }
    case 'heat_irrigate':
      return { ...base, type: 'irrigate', priority: a.severity === 'danger' || soon ? 'high' : 'medium' }
    default:
      return { ...base, type: 'protect', priority: 'high' }
  }
}

export async function buildBrief(
  profile: FarmerProfile,
  lang: LangCode,
  deps: { forecast: ForecastSource; clock: Clock },
) {
  const today = istDate(deps.clock())
  const toolCalls: ToolCallLog[] = []
  const forecast = await logged(toolCalls, 'get_weather', { lat: profile.lat, lon: profile.lon, days: 7 }, () =>
    deps.forecast(profile.lat, profile.lon),
  )
  const weekAdvisories = advisories(forecast.daily, lang)
  const season = seasonNow(today, lang)

  const actions: ActionItem[] = weekAdvisories.map((a) => fromAdvisory(a, today))
  if (sprayWindowOpen(forecast.daily)) {
    actions.push({
      id: `spray_window-${today}`,
      type: 'spray',
      priority: 'low',
      title: t(lang, 'act.sprayWindow.title'),
      detail: t(lang, 'act.sprayWindow.detail'),
      source: 'weather',
      route: '/label',
    })
  }
  const dayOfSeason = daysBetween(seasonOn(today).startDate, today) + 1
  if (dayOfSeason <= SOWING_NUDGE_DAYS) {
    actions.push({
      id: `sow-${season.season}-${today.slice(0, 4)}`,
      type: 'sow',
      priority: 'medium',
      title: sentenceCase(t(lang, 'act.sow.title', { season: season.name })),
      detail: t(lang, 'act.sow.detail', { season: season.name, n: dayOfSeason }),
      source: 'calendar',
      route: '/calendar',
    })
  }
  const rank = { high: 0, medium: 1, low: 2 }
  actions.sort((a, b) => rank[a.priority] - rank[b.priority])

  return {
    greeting: t(lang, 'greeting', { name: profile.name }),
    date: today,
    location: [profile.village, profile.district].filter(Boolean).join(', '),
    current: forecast.current,
    weather: forecast.daily.slice(0, 4),
    actions: actions.slice(0, MAX_ACTIONS),
    priceAlerts: [], // filled once the mandi service is built
    inField: [], // filled once the crop calendar is built
    seasonNow: season,
    toolCalls,
  }
}
