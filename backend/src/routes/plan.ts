import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVars } from '../auth.js'
import { canonicalDistrict } from '../data/districts.js'
import { ApiError, badRequest, notFound } from '../errors.js'
import { istDate, type Clock } from '../lib/time.js'
import { Irrigation, Lang, round2, Season } from '../schemas.js'
import { calendarResponse, cropsNeedingPrices, type Signals } from '../services/calendar.js'
import { analyse, type MandiSource } from '../services/mandi.js'
import { matchSchemes, SCHEME_IDS, sharedRecord } from '../services/schemes.js'
import { seasonOn } from '../services/seasons.js'
import { districtAt, soilReport } from '../services/soil.js'
import type { ForecastSource } from '../services/weather.js'
import type { Store } from '../store/types.js'
import { parseQuery } from './query.js'

const SoilQuery = z.object({
  lang: Lang.default('en'),
  lat: z.coerce.number().min(-90).max(90).transform(round2).optional(),
  lon: z.coerce.number().min(-180).max(180).transform(round2).optional(),
  district: z.string().trim().max(60).optional(),
})

const CalendarQuery = z.object({ lang: Lang.optional(), season: Season.optional() })

const SchemeAnswers = z.object({
  ownsLand: z.boolean(),
  landAcres: z.number().min(0).max(10_000),
  category: z.enum(['general', 'obc', 'sc', 'st']),
  hasBankAccount: z.boolean(),
  hasAadhaar: z.boolean(),
  isWoman: z.boolean(),
  irrigation: Irrigation,
  incomeTaxPayer: z.boolean(),
})
const MatchBody = z.object({ answers: SchemeAnswers, lang: Lang.default('en') })
const ShareBody = z.object({
  schemeId: z.enum(SCHEME_IDS as [string, ...string[]]),
  district: z.string().trim().max(60).optional(),
  crop: z.string().trim().max(40).optional(),
  landAcres: z.number().min(0).max(10_000).optional(),
  lang: Lang.default('en'),
})

async function jsonBody<T extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<z.infer<T>> {
  const body = await c.req.json().catch(() => {
    throw badRequest('invalid_json', 'Body must be JSON')
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ApiError(422, 'invalid_request', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`)
  }
  return parsed.data
}

export function planRoutes(deps: { store: Store; forecast: ForecastSource; mandi: MandiSource; clock: Clock }) {
  const r = new Hono<{ Variables: AuthVars }>()

  // SPEC: with a point (onboarding, before a profile exists) the point's district; without, the saved farm.
  r.get('/soil', async (c) => {
    const q = parseQuery(SoilQuery, c.req.query())
    let district: string | undefined
    if (q.lat !== undefined && q.lon !== undefined) {
      district = (q.district && canonicalDistrict(q.district)) || districtAt(q.lat, q.lon)
      if (!district) throw notFound('outside_maharashtra', 'This place is not in a Maharashtra district')
    } else {
      const profile = await deps.store.getFarmer(c.get('uid'))
      if (!profile) throw notFound('no_profile', 'No farmer profile yet')
      district = profile.district
    }
    return c.json(soilReport(district, q.lang))
  })

  r.get('/calendar', async (c) => {
    const q = parseQuery(CalendarQuery, c.req.query())
    const profile = await deps.store.getFarmer(c.get('uid'))
    if (!profile) throw notFound('no_profile', 'No farmer profile yet')
    const lang = q.lang ?? profile.lang
    const today = istDate(deps.clock())
    const season = q.season ?? seasonOn(today).season

    // live signals for "why now"; either can fail without failing the calendar
    const signals: Signals = { prices: {} }
    const [week] = await Promise.all([
      deps.forecast(profile.lat, profile.lon).then((f) => f.daily, () => undefined),
      ...cropsNeedingPrices(season, today).map(async (crop) => {
        try {
          const view = analyse(await deps.mandi(crop), profile)
          if (view) signals.prices[crop] = view
        } catch {
          /* no price line for this crop */
        }
      }),
    ])
    signals.week = week
    return c.json(calendarResponse(profile, q.season, today, lang, signals))
  })

  r.post('/schemes/match', async (c) => {
    const { answers, lang } = await jsonBody(c, MatchBody)
    return c.json({ schemes: matchSchemes(answers, lang) })
  })

  // Opt-in and anonymous: the record has no user id, and only fixed-list values are kept.
  r.post('/schemes/share', async (c) => {
    const body = await jsonBody(c, ShareBody)
    const shared = sharedRecord(body, istDate(deps.clock()))
    await deps.store.addSchemeInterest(shared)
    return c.json({ status: 'sent' as const, shared })
  })

  return r
}
