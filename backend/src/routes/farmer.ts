import { Hono } from 'hono'
import type { AuthVars } from '../auth.js'
import { ApiError, badRequest, notFound } from '../errors.js'
import { FarmerProfileInput, type FarmerProfile } from '../schemas.js'
import { soilOf } from '../services/soil.js'
import type { Clock } from '../lib/time.js'
import type { Store } from '../store/types.js'

export function farmerRoutes(store: Store, clock: Clock = () => new Date()) {
  const r = new Hono<{ Variables: AuthVars }>()

  r.get('/me', async (c) => {
    const profile = await store.getFarmer(c.get('uid'))
    if (!profile) throw notFound('no_profile', 'No farmer profile yet')
    return c.json(profile)
  })

  r.put('/me', async (c) => {
    const body = await c.req.json().catch(() => {
      throw badRequest('invalid_json', 'Body must be JSON')
    })
    const parsed = FarmerProfileInput.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ApiError(422, 'invalid_profile', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`)
    }
    const uid = c.get('uid')
    const input = parsed.data
    const existing = await store.getFarmer(uid)
    const now = clock().toISOString()
    const farmerSetSoil = input.soilSource === 'farmer' && input.soilType !== undefined
    const profile: FarmerProfile = {
      ...input,
      // SPEC: soil is never asked; it comes from the district unless the farmer corrected it.
      soilType: farmerSetSoil ? input.soilType! : soilOf(input.district),
      soilSource: farmerSetSoil ? 'farmer' : 'auto',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // server-owned: kept across saves; a new farmer has just been in the app
      lastSeenAt: existing ? existing.lastSeenAt : now,
    }
    await store.putFarmer(uid, profile)
    return c.json(profile)
  })

  r.delete('/me', async (c) => {
    await store.deleteFarmer(c.get('uid'))
    return c.json({ deleted: true as const })
  })

  return r
}
