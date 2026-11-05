import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { seasonNow, seasonOn } from '../src/services/seasons.js'
import { advisories, cached, openMeteo, toCondition, type Forecast, type WeatherDay } from '../src/services/weather.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'test-project' })
const verifyToken = async (t: string) => t.replace('token-', '')
// 5 Nov 2026, 10:00 IST
const clock = () => new Date('2026-11-05T04:30:00Z')

const day = (date: string, over: Partial<WeatherDay> = {}): WeatherDay => ({
  date,
  minC: 18,
  maxC: 30,
  rainProb: 0,
  rainMm: 0,
  windKmh: 10,
  condition: 'clear',
  ...over,
})
const week = (over: Record<number, Partial<WeatherDay>> = {}) =>
  Array.from({ length: 7 }, (_, i) => day(`2026-11-0${5 + i}`.replace(/-0(1\d)$/, '-$1'), over[i]))

const forecastOf = (daily: WeatherDay[]): Forecast => ({
  current: { tempC: 28, feelsLikeC: 30, humidity: 56, windKmh: 9.9, rainProb: 0, condition: 'clear' },
  daily,
})

const profile = {
  name: 'Ramesh',
  lang: 'mr',
  village: 'Niphad',
  district: 'Nashik',
  state: 'Maharashtra',
  lat: 20.08,
  lon: 74.11,
  crops: ['onion'],
  landAcres: 3,
  irrigation: 'drip',
  tankSizeLitres: 16,
  consentAt: '2026-11-05T10:00:00Z',
}

function setup(daily = week()) {
  const forecast = vi.fn(async () => forecastOf(daily))
  const app = createApp({ config, store: memoryStore(), verifyToken, forecast, mandi: async () => [], llm: async () => { throw new Error('unused') }, clock })
  const get = (path: string, uid = 'u1') => app.request(path, { headers: { Authorization: `Bearer token-${uid}` } })
  const put = (body: unknown, uid = 'u1') =>
    app.request('/farmer/me', {
      method: 'PUT',
      headers: { Authorization: `Bearer token-${uid}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  return { app, get, put, forecast }
}

describe('conditions', () => {
  it('maps WMO codes', () => {
    expect(toCondition(0)).toBe('clear')
    expect(toCondition(2)).toBe('partly_cloudy')
    expect(toCondition(3)).toBe('cloudy')
    expect(toCondition(45)).toBe('fog')
    expect(toCondition(61)).toBe('rain')
    expect(toCondition(61, 40)).toBe('heavy_rain')
    expect(toCondition(82)).toBe('heavy_rain')
    expect(toCondition(95)).toBe('thunderstorm')
  })
})

describe('advisories', () => {
  it('says no spray tomorrow when rain is likely, matching the SPEC example', () => {
    const a = advisories(week({ 1: { rainProb: 80, rainMm: 6 } }), 'en')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ rule: 'rain_no_spray', severity: 'danger', date: '2026-11-06' })
    expect(a[0]!.title).toBe("Don't spray tomorrow — 80% rain")
  })

  it('warns about wind and heat, in Marathi and Hindi', () => {
    const daily = week({ 0: { windKmh: 24 }, 2: { maxC: 43 } })
    const mr = advisories(daily, 'mr')
    expect(mr.map((a) => a.rule)).toEqual(['heat_irrigate', 'wind_no_spray'])
    expect(mr[0]!.title).toContain('कडक उष्णता')
    expect(mr[1]!.title).toMatch(/^आज जोराचा वारा/)
    expect(advisories(daily, 'hi')[1]!.title).toMatch(/^आज तेज़ हवा/)
  })

  it('names the weekday beyond tomorrow', () => {
    const a = advisories(week({ 2: { rainProb: 70 } }), 'en')
    expect(a[0]!.title).toBe("Don't spray on Saturday — 70% rain")
  })

  it('only looks 3 days ahead and stays quiet in calm weather', () => {
    expect(advisories(week({ 5: { rainProb: 90 } }), 'en')).toEqual([])
  })
})

describe('seasons', () => {
  it('knows rabi crosses the new year, leap years included', () => {
    expect(seasonOn('2026-11-05')).toMatchObject({ season: 'rabi', startDate: '2026-10-16', endDate: '2027-02-28' })
    expect(seasonOn('2028-02-29')).toMatchObject({ season: 'rabi', endDate: '2028-02-29', nextStarts: '2028-03-01' })
    expect(seasonOn('2027-07-01').season).toBe('kharif')
    expect(seasonOn('2027-04-10').season).toBe('zaid')
  })

  it('reports progress and days left', () => {
    expect(seasonNow('2026-11-05', 'mr')).toEqual({
      season: 'rabi',
      name: 'रब्बी',
      progress: 0.15,
      daysLeft: 115,
      nextSeason: 'zaid',
      nextStarts: '2027-03-01',
    })
  })
})

describe('GET /weather', () => {
  it('returns the forecast, rounded point, farm name nearby and advisories', async () => {
    const { get, put, forecast } = setup(week({ 1: { rainProb: 80 } }))
    await put(profile)
    const res = await get('/weather?lat=20.0812&lon=74.1149&lang=en')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(forecast).toHaveBeenCalledWith(20.08, 74.11)
    expect(body.location).toBe('Niphad, Nashik')
    expect(body.daily).toHaveLength(7)
    expect(body.advisories[0].rule).toBe('rain_no_spray')
  })

  it('has no place name far from the farm, and 400s on a bad point', async () => {
    const { get } = setup()
    expect((await (await get('/weather?lat=19.0&lon=72.8')).json()).location).toBe('')
    const bad = await get('/weather?lat=abc&lon=72.8')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('invalid_query')
  })
})

describe('GET /brief', () => {
  it('404s without a profile', async () => {
    const { get } = setup()
    expect((await get('/brief?lang=en')).status).toBe(404)
  })

  it('puts the weather warning first and stays within 3 actions', async () => {
    const { get, put } = setup(week({ 1: { rainProb: 85, rainMm: 12 } }))
    await put(profile)
    const b = await (await get('/brief?lang=en')).json()
    expect(b.greeting).toBe('Namaste, Ramesh')
    expect(b.date).toBe('2026-11-05')
    expect(b.location).toBe('Niphad, Nashik')
    expect(b.weather).toHaveLength(4)
    expect(b.actions.length).toBeLessThanOrEqual(3)
    expect(b.actions[0]).toMatchObject({ type: 'spray', priority: 'high', source: 'weather', route: '/weather' })
    expect(b.actions.some((a: { type: string }) => a.type === 'sow')).toBe(true) // day 21 of rabi
    expect(b.seasonNow.season).toBe('rabi')
    expect(b.toolCalls[0]).toMatchObject({ name: 'get_weather', args: { lat: 20.08, lon: 74.11, days: 7 } })
  })

  it("defaults to the profile's language and offers a spray window in calm weather", async () => {
    const { get, put } = setup()
    await put(profile)
    const b = await (await get('/brief')).json()
    expect(b.greeting).toBe('नमस्कार Ramesh')
    expect(b.actions.map((a: { type: string }) => a.type)).toEqual(['sow', 'spray'])
    expect(b.actions[1].route).toBe('/label')
  })
})

describe('Open-Meteo client', () => {
  const sample = {
    current: {
      temperature_2m: 28,
      apparent_temperature: 30.4,
      relative_humidity_2m: 56,
      wind_speed_10m: 9.9,
      weather_code: 0,
      precipitation_probability: null,
    },
    daily: {
      time: ['2026-11-05', '2026-11-06'],
      weather_code: [3, 63],
      temperature_2m_max: [30.6, 29.14],
      temperature_2m_min: [20.8, 19.1],
      precipitation_probability_max: [2, 75],
      precipitation_sum: [0, 8.26],
      wind_speed_10m_max: [10.3, 14.9],
    },
  }

  it('maps the response and falls back to the daily rain chance', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(sample)))
    const f = await openMeteo(fetchFn as unknown as typeof fetch)(20.08, 74.11)
    expect(String(fetchFn.mock.calls[0]![0])).toContain('timezone=Asia%2FKolkata')
    expect(f.current).toMatchObject({ tempC: 28, rainProb: 2, condition: 'clear' })
    expect(f.daily[1]).toEqual({
      date: '2026-11-06',
      minC: 19.1,
      maxC: 29.1,
      rainProb: 75,
      rainMm: 8.3,
      windKmh: 14.9,
      condition: 'rain',
    })
  })

  it('turns an outage into a 502 weather_unavailable', async () => {
    const down = openMeteo((async () => new Response('', { status: 503 })) as unknown as typeof fetch)
    await expect(down(20, 74)).rejects.toMatchObject({ status: 502, code: 'weather_unavailable' })
  })

  it('caches per point and retries after a failure', async () => {
    let n = 0
    const source = vi.fn(async () => {
      n += 1
      if (n === 1) throw new Error('blip')
      return forecastOf(week())
    })
    const f = cached(source)
    await expect(f(20, 74)).rejects.toThrow('blip')
    await f(20, 74)
    await f(20, 74)
    expect(source).toHaveBeenCalledTimes(2)
  })
})
