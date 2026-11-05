import { CROP_PLANS, type CropPlan, type SowingWindow } from '../data/calendar.js'
import { cropName } from '../data/crops.js'
import { DISTRICTS } from '../data/districts.js'
import { rupees, t } from '../lib/i18n.js'
import { tx } from '../lib/texts.js'
import { daysBetween, type LangCode } from '../lib/time.js'
import type { FarmerProfile } from '../schemas.js'
import type { MandiView } from './mandi.js'
import { SEASONS, seasonNow, seasonOn, type SeasonId } from './seasons.js'
import type { WeatherDay } from './weather.js'

// ---- Dates ------------------------------------------------------------------------------

/** The concrete dates of an MM-DD span that contains `today`, or else the next one to come. */
export function occurrence(today: string, from: string, to: string) {
  const year = Number(today.slice(0, 4))
  const options = [year - 1, year, year + 1].map((y) => {
    const start = `${y}-${from}`
    const end = `${to < from ? y + 1 : y}-${to}`
    return { start, end }
  })
  return options.find((o) => o.end >= today)!
}

const progressOf = (today: string, start: string, end: string) => {
  const total = daysBetween(start, end) + 1
  return Math.min(1, Math.max(0, Math.round((daysBetween(start, today) / total) * 100) / 100))
}

// ---- Crops in the field today -------------------------------------------------------------

export interface FieldCrop {
  crop: string
  name: string
  phase: 'sow' | 'grow' | 'protect' | 'harvest' | 'rest'
  stage: string
  task: string
  stageFrom: string
  stageTo: string
  progress: number
  year: { start: string; end: string; phase: FieldCrop['phase']; name: string }[]
}

/** Where each of the farmer's crops usually stands on today's date. */
export function fieldCrops(crops: string[], today: string, lang: LangCode): FieldCrop[] {
  return crops.flatMap((crop) => {
    const plan = CROP_PLANS[crop]
    if (!plan) return []
    const now = plan.year
      .map((s) => ({ s, o: occurrence(today, s.start, s.end) }))
      .find(({ o }) => o.start <= today && today <= o.end)
    if (!now) return []
    return [
      {
        crop,
        name: cropName(crop, lang),
        phase: now.s.phase,
        stage: tx(lang, `stage.${crop}.${now.s.key}`),
        task: tx(lang, `stage.${crop}.${now.s.key}.task`),
        stageFrom: now.o.start,
        stageTo: now.o.end,
        progress: progressOf(today, now.o.start, now.o.end),
        year: plan.year.map((s) => ({ start: s.start, end: s.end, phase: s.phase, name: tx(lang, `stage.${crop}.${s.key}`) })),
      },
    ]
  })
}

// ---- What to sow ----------------------------------------------------------------------------

type Suitability = 'high' | 'medium' | 'low'

export function suitability(plan: CropPlan, farm: Pick<FarmerProfile, 'soilType' | 'irrigation'>, lang: LangCode) {
  const soil = tx(lang, `cal.soil.${farm.soilType}`)
  let score = 2
  const why: string[] = []
  if (plan.goodSoils.includes(farm.soilType)) {
    score += 1
    why.push(tx(lang, 'cal.why.soilGood', { soil }))
  } else if (plan.poorSoils.includes(farm.soilType)) {
    score -= 1
    why.push(tx(lang, 'cal.why.soilPoor', { soil }))
  } else {
    why.push(tx(lang, 'cal.why.soilOk', { soil }))
  }
  if (plan.needsIrrigation && farm.irrigation === 'rainfed') {
    score -= 2
    why.push(tx(lang, 'cal.why.needsWater'))
  } else {
    why.push(tx(lang, plan.needsIrrigation ? 'cal.why.waterOk' : 'cal.why.rainfedOk'))
  }
  const level: Suitability = score >= 3 ? 'high' : score === 2 ? 'medium' : 'low'
  // sentence case for the first word of an English line
  return { level, why: why.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') }
}

/** The window of this crop in this season that is open now, or opens soonest. */
function windowFor(plan: CropPlan, season: SeasonId, today: string) {
  return plan.windows
    .filter((w) => w.season === season)
    .map((w) => ({ w, o: occurrence(today, w.from, w.to) }))
    .sort((a, b) => a.o.start.localeCompare(b.o.start))[0]
}

export interface Signals {
  week?: WeatherDay[]
  /** latest mandi view per crop, when prices could be fetched */
  prices: Record<string, MandiView>
}

function whyNow(crop: string, open: boolean, soonDays: number, farm: FarmerProfile, signals: Signals, lang: LangCode) {
  const weather: string[] = []
  // the forecast only matters for a window that is open or opens within a week
  if (signals.week?.length && (open || soonDays <= 7)) {
    const mm = Math.round(signals.week.reduce((s, d) => s + d.rainMm, 0))
    const hottest = Math.round(Math.max(...signals.week.map((d) => d.maxC)))
    // 10 mm or more in a week is enough to change when to sow
    weather.push(tx(lang, mm >= 10 ? 'cal.now.wet' : 'cal.now.dry', { mm }))
    if (hottest >= 38) weather.push(tx(lang, 'cal.now.heat', { t: hottest }))
  }
  const market: string[] = []
  const view = signals.prices[crop]
  const last = view?.trend.at(-1)
  if (view && last) {
    const pct = Math.round(Math.abs(view.changePct7d))
    const change = pct < 2 ? tx(lang, 'cal.now.flat') : tx(lang, view.changePct7d > 0 ? 'cal.now.up' : 'cal.now.down', { pct })
    market.push(tx(lang, 'cal.now.price', { crop: cropName(crop, lang), price: rupees(last.modalPrice), market: view.trendMarket, change }))
  }
  const district = lang === 'en' ? farm.district : (DISTRICTS[farm.district]?.dev ?? farm.district)
  const soil = [tx(lang, 'cal.now.soil', { district, soil: tx(lang, `cal.soil.${farm.soilType}`) })]
  return { weather, market, soil, news: [] as { headline: string; source: string; url: string; date: string }[] }
}

export function recommendations(farm: FarmerProfile, season: SeasonId, today: string, lang: LangCode, signals: Signals) {
  const rank = { high: 0, medium: 1, low: 2 }
  return Object.entries(CROP_PLANS)
    .flatMap(([crop, plan]) => {
      const win = windowFor(plan, season, today)
      if (!win) return []
      const open = win.o.start <= today && today <= win.o.end
      const days = open ? daysBetween(today, win.o.end) : daysBetween(today, win.o.start)
      const fit = suitability(plan, farm, lang)
      return [
        {
          crop,
          name: cropName(crop, lang),
          suitability: fit.level,
          sowingWindow: { from: win.o.start, to: win.o.end },
          windowBasis: 'calendar' as const,
          status: { phase: open ? ('open' as const) : ('upcoming' as const), days },
          durationDays: (win.w as SowingWindow).durationDays,
          why: fit.why,
          whyNow: whyNow(crop, open, days, farm, signals, lang),
          timeline: plan.timeline.map(([week, title, tasks]) => ({ week, title: tx(lang, title), tasks: tasks.map((k) => tx(lang, k)) })),
        },
      ]
    })
    .sort(
      (a, b) =>
        Number(b.status.phase === 'open') - Number(a.status.phase === 'open') ||
        rank[a.suitability] - rank[b.suitability] ||
        a.status.days - b.status.days,
    )
}

/** Crops worth a mandi lookup for the "why now" lines: open or opening within a month. */
export function cropsNeedingPrices(season: SeasonId, today: string, max = 4): string[] {
  return Object.entries(CROP_PLANS)
    .flatMap(([crop, plan]) => {
      const win = windowFor(plan, season, today)
      if (!win) return []
      const soon = win.o.start <= today ? 0 : daysBetween(today, win.o.start)
      return soon <= 30 ? [crop] : []
    })
    .slice(0, max)
}

export function calendarResponse(
  farm: FarmerProfile,
  shown: SeasonId | undefined,
  today: string,
  lang: LangCode,
  signals: Signals,
) {
  const current = seasonOn(today).season
  const season = shown ?? current
  return {
    season,
    today,
    currentSeason: current,
    seasonNow: seasonNow(today, lang),
    seasons: SEASONS.map((s) => ({ season: s.season, name: t(lang, `season.${s.season}`), start: s.start, end: s.end })),
    onset: null,
    inField: fieldCrops(farm.crops, today, lang),
    recommendations: recommendations(farm, season, today, lang, signals),
  }
}

