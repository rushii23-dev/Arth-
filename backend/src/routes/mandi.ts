import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVars } from '../auth.js'
import { isCrop } from '../data/crops.js'
import { ApiError, badRequest } from '../errors.js'
import { Lang, round2 } from '../schemas.js'
import { analyse, type MandiSource } from '../services/mandi.js'
import { sellAdvice } from '../services/sell.js'
import { parseQuery } from './query.js'

const Commodity = z.string().refine((c) => isCrop(c), { message: 'unknown commodity' })
const Point = {
  lat: z.coerce.number().min(-90).max(90).transform(round2),
  lon: z.coerce.number().min(-180).max(180).transform(round2),
}

const PricesQuery = z.object({ commodity: Commodity, ...Point })
const SellRequest = z.object({
  commodity: Commodity,
  quantityQuintals: z.number().positive().max(10_000),
  lat: z.number().min(-90).max(90).transform(round2),
  lon: z.number().min(-180).max(180).transform(round2),
  lang: Lang.default('en'),
})

export function mandiRoutes(deps: { mandi: MandiSource; rsPerQuintalKm: number }) {
  const r = new Hono<{ Variables: AuthVars }>()

  async function view(commodity: string, at: { lat: number; lon: number }) {
    const v = analyse(await deps.mandi(commodity), at)
    if (!v) throw new ApiError(404, 'no_prices', `No recent ${commodity} prices near this place`)
    return v
  }

  r.get('/prices', async (c) => {
    const q = parseQuery(PricesQuery, c.req.query())
    const v = await view(q.commodity, q)
    return c.json({ commodity: q.commodity, unit: 'quintal' as const, ...v })
  })

  r.post('/sell-advice', async (c) => {
    const body = await c.req.json().catch(() => {
      throw badRequest('invalid_json', 'Body must be JSON')
    })
    const parsed = SellRequest.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ApiError(422, 'invalid_request', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`)
    }
    const req = parsed.data
    return c.json(sellAdvice(await view(req.commodity, req), req, deps.rsPerQuintalKm))
  })

  return r
}
