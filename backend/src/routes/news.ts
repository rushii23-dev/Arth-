import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVars } from '../auth.js'
import { canonicalDistrict } from '../data/districts.js'
import { notFound } from '../errors.js'
import { istDate, type Clock } from '../lib/time.js'
import { Lang } from '../schemas.js'
import type { NewsService } from '../services/news.js'
import type { Store } from '../store/types.js'
import { parseQuery } from './query.js'

const NewsQuery = z.object({ lang: Lang.optional() })

/** GET /news?lang=mr: today's official farm news for the farmer's own district (from the profile, never the query). */
export function newsRoutes(deps: { store: Store; news: NewsService; clock: Clock }) {
  const r = new Hono<{ Variables: AuthVars }>()
  r.get('/news', async (c) => {
    const { lang } = parseQuery(NewsQuery, c.req.query())
    const profile = await deps.store.getFarmer(c.get('uid'))
    if (!profile) throw notFound('no_profile', 'No farmer profile yet')
    const date = istDate(deps.clock())
    const district = canonicalDistrict(profile.district) ?? profile.district
    return c.json(await deps.news(district, date, lang ?? profile.lang))
  })
  return r
}
