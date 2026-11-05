import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVars } from '../auth.js'
import { notFound } from '../errors.js'
import type { Clock } from '../lib/time.js'
import { Lang, round2 } from '../schemas.js'
import { buildBrief } from '../services/brief.js'
import type { MandiSource } from '../services/mandi.js'
import { advisories, type ForecastSource } from '../services/weather.js'
import type { Store } from '../store/types.js'
import { parseQuery } from './query.js'

const WeatherQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).transform(round2),
  lon: z.coerce.number().min(-180).max(180).transform(round2),
  lang: Lang.default('en'),
})

const BriefQuery = z.object({ lang: Lang.optional() })

/** Within ~5 km of the saved farm, the farm's own place name is the right label. */
const NEAR_DEG = 0.05

export function weatherRoutes(deps: { store: Store; forecast: ForecastSource; mandi: MandiSource; clock: Clock }) {
  const r = new Hono<{ Variables: AuthVars }>()

  r.get('/weather', async (c) => {
    const { lat, lon, lang } = parseQuery(WeatherQuery, c.req.query())
    const [forecast, profile] = await Promise.all([deps.forecast(lat, lon), deps.store.getFarmer(c.get('uid'))])
    const nearFarm = profile && Math.abs(profile.lat - lat) <= NEAR_DEG && Math.abs(profile.lon - lon) <= NEAR_DEG
    return c.json({
      location: nearFarm ? [profile.village, profile.district].filter(Boolean).join(', ') : '',
      current: forecast.current,
      daily: forecast.daily,
      advisories: advisories(forecast.daily, lang),
    })
  })

  r.get('/brief', async (c) => {
    const { lang } = parseQuery(BriefQuery, c.req.query())
    const profile = await deps.store.getFarmer(c.get('uid'))
    if (!profile) throw notFound('no_profile', 'No farmer profile yet')
    return c.json(await buildBrief(profile, lang ?? profile.lang, deps))
  })

  return r
}
