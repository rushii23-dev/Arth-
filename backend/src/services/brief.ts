import { CROPS, cropName } from '../data/crops.js'
import { rupees, sentenceCase, t } from '../lib/i18n.js'
import { daysBetween, istDate, type Clock, type LangCode } from '../lib/time.js'
import type { FarmerProfile } from '../schemas.js'
import { fieldCrops } from './calendar.js'
import { analyse, type MandiSource } from './mandi.js'
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

export interface PriceAlert {
  commodity: string
  market: string
  modalPrice: number
  changePct: number
  direction: 'up' | 'down' | 'flat'
}

/** Days into a season during which the brief nudges the farmer to plan sowing. */
const SOWING_NUDGE_DAYS = 45
const MAX_ACTIONS = 3
const MAX_PRICE_ALERTS = 3
/** Week-on-week moves smaller than this read as flat. */
const FLAT_PCT = 2
/** A rise this big gets its own "think about selling" action. */
const SELL_NUDGE_PCT = 5

/** Prices for the farmer's own crops at the nearest busy market. A failed crop is skipped, never fatal. */
async function priceAlerts(profile: FarmerProfile, mandi: MandiSource, log: ToolCallLog[]): Promise<PriceAlert[]> {
  const crops = profile.crops.filter((c) => c in CROPS).slice(0, MAX_PRICE_ALERTS)
  const alerts = await Promise.all(
    crops.map(async (commodity): Promise<PriceAlert | null> => {
      try {
        const records = await logged(log, 'get_mandi_prices', { commodity, district: profile.district }, () => mandi(commodity))
        const view = analyse(records, profile)
        const last = view?.trend.at(-1)
        if (!view || !last) return null
        const changePct = view.changePct7d
        return {
          commodity,
          market: view.trendMarket,
          modalPrice: last.modalPrice,
          changePct,
          direction: Math.abs(changePct) < FLAT_PCT ? 'flat' : changePct > 0 ? 'up' : 'down',
        }
      } catch {
        return null
      }
    }),
  )
  return alerts.filter((a): a is PriceAlert => a !== null)
}

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
  deps: { forecast: ForecastSource; mandi: MandiSource; clock: Clock },
) {
  const today = istDate(deps.clock())
  const toolCalls: ToolCallLog[] = []
  const [forecast, alerts] = await Promise.all([
    logged(toolCalls, 'get_weather', { lat: profile.lat, lon: profile.lon, days: 7 }, () =>
      deps.forecast(profile.lat, profile.lon),
    ),
    priceAlerts(profile, deps.mandi, toolCalls),
  ])
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
  for (const a of alerts.filter((x) => x.changePct >= SELL_NUDGE_PCT)) {
    const vars = { crop: cropName(a.commodity, lang), pct: Math.round(a.changePct), market: a.market }
    actions.push({
      id: `sell-${a.commodity}-${today}`,
      type: 'sell',
      priority: 'medium',
      title: t(lang, 'act.priceUp.title', vars),
      detail: t(lang, 'act.priceUp.detail', { price: rupees(a.modalPrice) }),
      source: 'mandi',
      route: '/mandi',
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
    priceAlerts: alerts,
    inField: fieldCrops(profile.crops, today, lang),
    seasonNow: season,
    toolCalls,
  }
}
