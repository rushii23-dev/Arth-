import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { relayRoute, viaRelay } from '../src/services/relay.js'
import { memoryStore } from '../src/store/memory.js'

const TODAY = '9ef84268-d588-465a-a308-a864a43d0070'
const ok = () => new Response('{"records":[]}', { status: 200, headers: { 'content-type': 'application/json' } })

describe('viaRelay', () => {
  it('sends data.gov.in calls to the relay with the key in a header, not the URL', async () => {
    const fetchFn = vi.fn(async () => ok())
    const f = viaRelay('https://relay.example/', fetchFn as unknown as typeof fetch)
    await f(`https://api.data.gov.in/resource/${TODAY}?api-key=K&format=json&limit=1`)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://relay.example/relay/data-gov-in/resource/${TODAY}?format=json&limit=1`)
    expect(url).not.toContain('K&')
    expect(new Headers(init.headers).get('x-arth-relay-key')).toBe('K')
  })

  it('leaves other hosts alone', async () => {
    const fetchFn = vi.fn(async () => ok())
    await viaRelay('https://relay.example', fetchFn as unknown as typeof fetch)('https://api.open-meteo.com/v1/forecast')
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('https://api.open-meteo.com/v1/forecast')
  })
})

describe('relayRoute', () => {
  const upstream = vi.fn(async () => ok())
  const r = relayRoute('K', upstream as unknown as typeof fetch)

  it('refuses a caller without the right key', async () => {
    expect((await r.request(`/resource/${TODAY}`)).status).toBe(403)
    expect((await r.request(`/resource/${TODAY}`, { headers: { 'x-arth-relay-key': 'wrong' } })).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('forwards only the Agmarknet price resources', async () => {
    const res = await r.request('/resource/some-other-dataset', { headers: { 'x-arth-relay-key': 'K' } })
    expect(res.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('adds its own key and passes the answer through', async () => {
    const res = await r.request(`/resource/${TODAY}?format=json&limit=1&api-key=evil`, { headers: { 'x-arth-relay-key': 'K' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ records: [] })
    const url = new URL((upstream.mock.calls[0] as unknown as [string])[0])
    expect(url.origin + url.pathname).toBe(`https://api.data.gov.in/resource/${TODAY}`)
    expect(url.searchParams.getAll('api-key')).toEqual(['K'])
  })

  it('is refused when this server has no key', async () => {
    const res = await relayRoute('').request(`/resource/${TODAY}`, { headers: { 'x-arth-relay-key': '' } })
    expect(res.status).toBe(403)
  })
})

describe('relay in the app', () => {
  it('is reachable without a sign-in token, and the API still needs one', async () => {
    const app = createApp({
      config: loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p', ARTH_DATA_GOV_IN_API_KEY: 'K' }),
      store: memoryStore(),
      verifyToken: async () => {
        throw new Error('no token checks expected')
      },
      forecast: async () => {
        throw new Error('unused')
      },
      mandi: async () => [],
      llm: async () => {
        throw new Error('unused')
      },
    })
    const res = await app.request(`/relay/data-gov-in/resource/${TODAY}`, { headers: { 'x-arth-relay-key': 'wrong' } })
    expect(res.status).toBe(403)
    expect((await app.request('/mandi/onion')).status).toBe(401)
  })
})
