import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { memoryStore } from '../src/store/memory.js'

// Firebase Hosting's CDN cached "no profile yet" (404) for every farmer when the API sent no Cache-Control.
describe('API answers are never cached by a shared cache', () => {
  const app = createApp({
    config: loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p' }),
    store: memoryStore(),
    verifyToken: async () => 'u1',
    forecast: async () => {
      throw new Error('unused')
    },
    mandi: async () => [],
    llm: async () => {
      throw new Error('unused')
    },
  })
  const h = { Authorization: 'Bearer x', 'Content-Type': 'application/json' }

  it('marks an error answer private, no-store', async () => {
    const res = await app.request('/api/farmer/me', { headers: h })
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('marks a 401 and an unknown path the same way', async () => {
    expect((await app.request('/api/farmer/me')).headers.get('Cache-Control')).toBe('private, no-store')
    expect((await app.request('/api/nope', { headers: h })).headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('marks a profile answer private, no-store', async () => {
    const put = await app.request('/api/farmer/me', {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({
        name: 'Ramesh', lang: 'mr', village: 'Niphad', district: 'Nashik', state: 'Maharashtra', lat: 20.08, lon: 74.11,
        crops: ['onion'], landAcres: 2, irrigation: 'drip', waterSources: ['drip'], tankSizeLitres: 16, consentAt: '2026-11-05T10:00:00Z',
      }),
    })
    const get = await app.request('/api/farmer/me', { headers: h })
    expect(get.headers.get('Cache-Control')).toBe('private, no-store')
    expect([put.status, get.status]).toEqual([200, 200])
  })
})
