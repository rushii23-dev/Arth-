import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { addDays } from '../src/lib/time.js'
import { analyse, cachedMandi, changePct, dataGovIn, slopePerDay, type PriceRecord } from '../src/services/mandi.js'
import { sellAdvice } from '../src/services/sell.js'
import type { Forecast } from '../src/services/weather.js'
import { memoryStore } from '../src/store/memory.js'

const NIPHAD = { lat: 20.08, lon: 74.11 }
const ASOF = '2026-11-04'

/** `days` daily prices ending on ASOF, starting at `start` and moving `step` ₹ a day. */
function series(market: string, district: string, start: number, step: number, days = 30): PriceRecord[] {
  return Array.from({ length: days }, (_, i) => {
    const modal = start + step * i
    return { market, district, date: addDays(ASOF, i - days + 1), minPrice: modal - 500, maxPrice: modal + 500, modalPrice: modal }
  })
}

const records: PriceRecord[] = [
  ...series('Lasalgaon', 'Nashik', 2400, 20), // Nashik HQ ~ 50 km road; rising ₹20/day → 2980
  ...series('Pune', 'Pune', 3000, 0), // ~ 240 km; flat 3000
  ...series('Solapur', 'Solapur', 3200, 0, 3), // ~ 400 km: too far
  { market: 'Old Market', district: 'Nashik', date: '2026-09-01', minPrice: 1000, maxPrice: 1500, modalPrice: 1200 },
  { market: 'Nowhere', district: 'Atlantis', date: ASOF, minPrice: 1, maxPrice: 1, modalPrice: 9999 },
]

describe('analyse', () => {
  const v = analyse(records, NIPHAD)!

  it('keeps nearby markets with a current price, highest price first', () => {
    expect(v.asOf).toBe(ASOF)
    expect(v.markets.map((m) => m.market)).toEqual(['Pune', 'Lasalgaon'])
    expect(v.markets[1]).toMatchObject({ modalPrice: 2980, district: 'Nashik', arrivalDate: ASOF })
    expect(v.markets[1]!.distanceKm).toBeLessThan(v.markets[0]!.distanceKm)
  })

  it('trends the nearest busy market over 30 days', () => {
    expect(v.trendMarket).toBe('Lasalgaon')
    expect(v.trend).toHaveLength(30)
    expect(v.trend.at(-1)).toEqual({ date: ASOF, modalPrice: 2980 })
    // 7 days ago: 2840 → 2980 = +4.9%
    expect(v.changePct7d).toBe(4.9)
  })

  it('returns null with nothing usable', () => {
    expect(analyse([], NIPHAD)).toBeNull()
  })
})

describe('slope and change', () => {
  it('fits ₹/day over the last week', () => {
    expect(slopePerDay(series('M', 'Pune', 1000, 15))).toBe(15)
    expect(slopePerDay(series('M', 'Pune', 1000, -8))).toBe(-8)
    expect(slopePerDay([])).toBe(0)
  })
  it('is 0 without history', () => {
    expect(changePct([{ date: ASOF, modalPrice: 100 }], 7)).toBe(0)
  })
})

describe('sell advice', () => {
  const v = analyse(records, NIPHAD)!

  it('ranks by earnings after transport and says WAIT for a rising storable crop', () => {
    const a = sellAdvice(v, { commodity: 'onion', quantityQuintals: 20, lang: 'en' }, 2)
    const pune = a.options.find((o) => o.market === 'Pune')!
    expect(pune.transportCost).toBe(pune.distanceKm * 2 * 20)
    expect(pune.netEarning).toBe(3000 * 20 - pune.transportCost)
    expect(a.options[0]!.netEarning).toBeGreaterThanOrEqual(a.options[1]!.netEarning)
    expect(a.bestMarket).toBe(a.options[0]!.market)
    expect(a.trendSlope).toBe(20)
    expect(a.recommendation).toBe('WAIT')
    expect(a.reasoning).toContain('stores well')
  })

  it('says SELL_NOW for a perishable crop even when prices rise, in Marathi', () => {
    const a = sellAdvice(v, { commodity: 'tomato', quantityQuintals: 10, lang: 'mr' }, 2)
    expect(a.recommendation).toBe('SELL_NOW')
    expect(a.reasoning).toContain('टोमॅटो')
    expect(a.reasoning).toContain('टिकत नाही')
  })

  it('says SELL_NOW when prices are flat', () => {
    const flat = analyse(series('Lasalgaon', 'Nashik', 2500, 0), NIPHAD)!
    expect(sellAdvice(flat, { commodity: 'onion', quantityQuintals: 5, lang: 'hi' }, 2).recommendation).toBe('SELL_NOW')
  })
})

describe('data.gov.in client', () => {
  const todayRow = { state: 'Maharashtra', district: 'Ahmednagar', market: 'Rahuri ', commodity: 'Onion', arrival_date: '05/11/2026', min_price: 1500, max_price: 3500, modal_price: 2800 }
  const histRow = (date: string, modal: string) => ({ State: 'Maharashtra', District: 'Nashik', Market: 'Lasalgaon', Commodity: 'Onion', Arrival_Date: date, Min_Price: '1000', Max_Price: '3000', Modal_Price: modal })

  it('merges today with the tail of history, normalising names and dates', async () => {
    const urls: string[] = []
    const fetchFn = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('9ef84268')) return Response.json({ records: [todayRow] })
      if (url.includes('limit=1&') || url.endsWith('limit=1')) return Response.json({ total: 5825, records: [] })
      return Response.json({ records: [histRow('03/11/2026', '2900'), histRow('04/11/2026', '2950')] })
    })
    const out = await dataGovIn('k', fetchFn as unknown as typeof fetch)('onion')
    expect(urls.some((u) => u.includes('offset=4825'))).toBe(true)
    expect(out).toContainEqual({ market: 'Rahuri', district: 'Ahmednagar', date: '2026-11-05', minPrice: 1500, maxPrice: 3500, modalPrice: 2800 })
    expect(out.filter((r) => r.market === 'Lasalgaon').map((r) => r.date)).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('reports a rate limit as a retryable 503', async () => {
    const limited = dataGovIn('k', (async () => new Response('{"error":"Rate limit exceeded"}', { status: 429 })) as unknown as typeof fetch)
    await expect(limited('onion')).rejects.toMatchObject({ status: 503, code: 'mandi_rate_limited' })
  })

  it('serves the last good prices when a refresh fails', async () => {
    let t = 0
    let fail = false
    const source = vi.fn(async () => {
      if (fail) throw new Error('down')
      return records
    })
    const m = cachedMandi(source, 1000, () => t)
    expect(await m('onion')).toBe(records)
    t = 5000
    fail = true
    expect(await m('onion')).toBe(records)
    expect(source).toHaveBeenCalledTimes(2)
  })
})

describe('mandi routes and brief alerts', () => {
  const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p' })
  const calm: Forecast = {
    current: { tempC: 28, feelsLikeC: 30, humidity: 50, windKmh: 8, rainProb: 0, condition: 'clear' },
    daily: Array.from({ length: 7 }, (_, i) => ({ date: addDays('2026-11-05', i), minC: 18, maxC: 30, rainProb: 0, rainMm: 0, windKmh: 8, condition: 'clear' as const })),
  }
  const app = createApp({
    config,
    store: memoryStore(),
    verifyToken: async () => 'u1',
    forecast: async () => calm,
    mandi: async (c) => (c === 'onion' ? records : []),
    llm: async () => {
      throw new Error('unused')
    },
    clock: () => new Date('2026-11-05T04:30:00Z'),
  })
  const h = { Authorization: 'Bearer x', 'Content-Type': 'application/json' }

  it('GET /mandi/prices', async () => {
    const res = await app.request('/mandi/prices?commodity=onion&lat=20.08&lon=74.11', { headers: h })
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b).toMatchObject({ commodity: 'onion', unit: 'quintal', asOf: ASOF, trendMarket: 'Lasalgaon' })
    expect((await app.request('/mandi/prices?commodity=gold&lat=20&lon=74', { headers: h })).status).toBe(400)
    const none = await app.request('/mandi/prices?commodity=wheat&lat=20&lon=74', { headers: h })
    expect(none.status).toBe(404)
    expect((await none.json()).error.code).toBe('no_prices')
  })

  it('POST /mandi/sell-advice', async () => {
    const res = await app.request('/mandi/sell-advice', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ commodity: 'onion', quantityQuintals: 20, lat: 20.08, lon: 74.11, lang: 'en' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).recommendation).toBe('WAIT')
    const bad = await app.request('/mandi/sell-advice', { method: 'POST', headers: h, body: JSON.stringify({ commodity: 'onion' }) })
    expect(bad.status).toBe(422)
  })

  it('the brief shows price alerts for the farmer\'s crops and skips crops without prices', async () => {
    await app.request('/farmer/me', {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({ name: 'R', lang: 'en', village: 'Niphad', district: 'Nashik', state: 'Maharashtra', ...NIPHAD, crops: ['onion', 'wheat'], landAcres: 3, irrigation: 'drip', tankSizeLitres: 16, consentAt: null }),
    })
    const b = await (await app.request('/brief', { headers: h })).json()
    expect(b.priceAlerts).toEqual([{ commodity: 'onion', market: 'Lasalgaon', modalPrice: 2980, changePct: 4.9, direction: 'up' }])
    expect(b.toolCalls.map((c: { name: string }) => c.name).sort()).toEqual(['get_mandi_prices', 'get_mandi_prices', 'get_weather'])
  })
})
