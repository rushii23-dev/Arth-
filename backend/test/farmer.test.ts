import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'test-project' })
// "token-<uid>" is valid for <uid>; anything else is rejected
const verifyToken = async (t: string) => {
  if (!t.startsWith('token-')) throw new Error('bad token')
  return t.slice('token-'.length)
}

const profile = {
  name: 'Ramesh',
  lang: 'mr',
  village: 'Niphad',
  district: 'Nashik',
  state: 'Maharashtra',
  lat: 20.08123,
  lon: 74.10987,
  crops: ['onion', 'grapes'],
  landAcres: 3,
  irrigation: 'drip',
  waterSources: ['drip', 'borewell'],
  tankSizeLitres: 16,
  consentAt: '2026-11-05T10:00:00Z',
}

let app: ReturnType<typeof createApp>
beforeEach(() => {
  app = createApp({ config, store: memoryStore(), verifyToken })
})

const call = (method: string, path: string, uid: string | null, body?: unknown) =>
  app.request(path, {
    method,
    headers: { ...(uid ? { Authorization: `Bearer token-${uid}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })

describe('auth', () => {
  it('rejects a missing token with 401 in the SPEC error shape', async () => {
    const res = await call('GET', '/farmer/me', null)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } })
  })

  it('rejects an invalid token', async () => {
    const res = await app.request('/farmer/me', { headers: { Authorization: 'Bearer nope' } })
    expect(res.status).toBe(401)
  })

  it('serves /health without sign-in, on both bare and /api paths', async () => {
    for (const p of ['/health', '/api/health']) {
      const res = await app.request(p)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
    }
  })
})

describe('/farmer/me', () => {
  it('404s before onboarding', async () => {
    const res = await call('GET', '/farmer/me', 'u1')
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('no_profile')
  })

  it('saves, rounds coordinates, fills soil and timestamps', async () => {
    const res = await call('PUT', '/farmer/me', 'u1', profile)
    expect(res.status).toBe(200)
    const saved = await res.json()
    expect(saved).toMatchObject({ name: 'Ramesh', lat: 20.08, lon: 74.11, soilType: 'black', soilSource: 'auto' })
    expect(saved.createdAt).toBe(saved.updatedAt)

    const got = await (await call('GET', '/api/farmer/me', 'u1')).json()
    expect(got).toEqual(saved)
  })

  it('keeps createdAt on update and keeps a soil the farmer corrected', async () => {
    const first = await (await call('PUT', '/farmer/me', 'u1', profile)).json()
    await new Promise((r) => setTimeout(r, 5))
    const second = await (await call('PUT', '/farmer/me', 'u1', { ...profile, soilType: 'red', soilSource: 'farmer' })).json()
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt).not.toBe(first.updatedAt)
    expect(second).toMatchObject({ soilType: 'red', soilSource: 'farmer' })
  })

  it('takes the user only from the token, never the body', async () => {
    await call('PUT', '/farmer/me', 'u1', { ...profile, uid: 'u2' })
    expect((await call('GET', '/farmer/me', 'u2')).status).toBe(404)
    expect((await (await call('GET', '/farmer/me', 'u1')).json()).uid).toBeUndefined()
  })

  it('rejects an invalid profile with 422', async () => {
    const res = await call('PUT', '/farmer/me', 'u1', { ...profile, lang: 'fr' })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('invalid_profile')
  })

  it('deletes the profile', async () => {
    await call('PUT', '/farmer/me', 'u1', profile)
    expect(await (await call('DELETE', '/farmer/me', 'u1')).json()).toEqual({ deleted: true })
    expect((await call('GET', '/farmer/me', 'u1')).status).toBe(404)
  })
})

it('unknown paths return the SPEC error shape', async () => {
  const res = await call('GET', '/nope', 'u1')
  expect(res.status).toBe(404)
  expect((await res.json()).error.code).toBe('not_found')
})
