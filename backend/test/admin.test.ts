import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import type { Identity } from '../src/auth.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p', ARTH_ADMIN_EMAILS: 'Founder@Example.com, second@example.com' })

/** "Bearer <uid>|<email>" signs in as <uid>, with that verified email when given. */
const verifyToken = async (t: string): Promise<Identity> => {
  const [uid, email] = t.split('|')
  return { uid: uid!, email: email || null }
}

let now = new Date('2026-11-11T06:30:00Z') // 12:00 IST

function setup() {
  const store = memoryStore()
  const app = createApp({
    config,
    store,
    verifyToken,
    forecast: async () => ({ current: null, daily: [] }) as never,
    mandi: async () => [],
    llm: async () => {
      throw new Error('unused')
    },
    clock: () => now,
  })
  const call = (method: string, path: string, who: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${who}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  return { app, store, call }
}

const farmer = (name: string, district: string, crops: string[], lang = 'mr') => ({
  name,
  lang,
  village: `${name} village`,
  district,
  state: 'Maharashtra',
  lat: 20.08,
  lon: 74.11,
  crops,
  landAcres: 2,
  irrigation: 'rainfed',
  tankSizeLitres: 16,
  consentAt: '2026-11-01T10:00:00Z',
})

describe('founder dashboard', () => {
  it('tells each user only whether they are an admin', async () => {
    const { call } = setup()
    expect(await (await call('GET', '/admin/access', 'u1|founder@example.com')).json()).toEqual({ admin: true })
    expect(await (await call('GET', '/admin/access', 'u2|farmer@example.com')).json()).toEqual({ admin: false })
    // an unverified email arrives as null from the verifier
    expect(await (await call('GET', '/admin/access', 'u3')).json()).toEqual({ admin: false })
  })

  it('refuses the data to anyone not on the list, verified or not', async () => {
    const { call } = setup()
    for (const who of ['u2|farmer@example.com', 'u3', 'u4|founder@example.com.evil']) {
      const res = await call('GET', '/admin/overview', who)
      expect(res.status, who).toBe(403)
      const body = await res.json()
      expect(body).toEqual({ error: { code: 'forbidden', message: 'Not allowed' } })
    }
    expect((await call('GET', '/admin/overview', 'nobody')).status).toBe(403)
  })

  it('counts farmers, signups, districts, crops, languages and who has gone quiet', async () => {
    const { call, store } = setup()
    // two weeks ago: Asha signs up, then never comes back
    now = new Date('2026-10-28T05:00:00Z')
    expect((await call('PUT', '/farmer/me', 'a', farmer('Asha', 'Nashik', ['onion', 'grapes']))).status).toBe(200)
    // three days ago: Bhau signs up
    now = new Date('2026-11-08T05:00:00Z')
    await call('PUT', '/farmer/me', 'b', farmer('Bhau', 'pune', ['onion'], 'hi'))
    // today: Chandu signs up, and Bhau opens Home
    now = new Date('2026-11-11T06:30:00Z')
    await call('PUT', '/farmer/me', 'c', farmer('Chandu', 'Nashik', ['cotton'], 'en'))
    const brief = await call('GET', '/brief?lang=mr', 'b')
    expect(brief.status).not.toBe(401)
    expect((await store.getFarmer('b'))?.lastSeenAt).toBe('2026-11-11T06:30:00.000Z')

    const res = await call('GET', '/admin/overview', 'z|founder@example.com')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const o = await res.json()
    expect(o.today).toBe('2026-11-11')
    expect(o.totals).toEqual({ farmers: 3, signupsToday: 1, signups7d: 2, activeToday: 2, active7d: 2, inactive7d: 1 })
    expect(o.byDistrict).toEqual([
      { key: 'Nashik', count: 2 },
      { key: 'Pune', count: 1 },
    ])
    expect(o.byCrop).toEqual([
      { key: 'onion', count: 2 },
      { key: 'cotton', count: 1 },
      { key: 'grapes', count: 1 },
    ])
    expect(o.byLang).toEqual([
      { key: 'en', count: 1 },
      { key: 'hi', count: 1 },
      { key: 'mr', count: 1 },
    ])
    expect(o.recent.map((f: { name: string }) => f.name)).toEqual(['Chandu', 'Bhau', 'Asha'])
    expect(o.recent[0]).toEqual({
      name: 'Chandu',
      village: 'Chandu village',
      district: 'Nashik',
      crops: ['cotton'],
      lang: 'en',
      signedUpAt: '2026-11-11T06:30:00.000Z',
      lastSeenAt: '2026-11-11T06:30:00.000Z',
    })
    expect(o.inactive.map((f: { name: string }) => f.name)).toEqual(['Asha'])
    // never a UID
    expect(JSON.stringify(o)).not.toMatch(/"uid"|"a"|"b"|"c"/)
  })

  it('writes "last seen" at most once a day, and keeps it across profile saves', async () => {
    const { call, store } = setup()
    now = new Date('2026-11-10T05:00:00Z')
    await call('PUT', '/farmer/me', 'a', farmer('Asha', 'Nashik', ['onion']))
    let writes = 0
    const touch = store.touchFarmer.bind(store)
    store.touchFarmer = async (uid, at) => {
      writes++
      return touch(uid, at)
    }
    now = new Date('2026-11-11T03:00:00Z')
    await call('GET', '/brief', 'a')
    now = new Date('2026-11-11T09:00:00Z')
    await call('GET', '/brief', 'a')
    expect(writes).toBe(1)
    expect((await store.getFarmer('a'))?.lastSeenAt).toBe('2026-11-11T03:00:00.000Z')
    // the client cannot set it, and a save keeps it
    await call('PUT', '/farmer/me', 'a', { ...farmer('Asha', 'Nashik', ['onion']), lastSeenAt: '2020-01-01T00:00:00Z' })
    expect((await store.getFarmer('a'))?.lastSeenAt).toBe('2026-11-11T03:00:00.000Z')
  })
})
