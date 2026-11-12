import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { addDays } from '../src/lib/time.js'
import { fieldCrops, occurrence } from '../src/services/calendar.js'
import { landBand, matchSchemes, type SchemeAnswers } from '../src/services/schemes.js'
import type { Forecast } from '../src/services/weather.js'
import { memoryStore } from '../src/store/memory.js'
import type { Store } from '../src/store/types.js'
import { devanagariLang, wrongLanguage } from '../scripts/lang.js'
import { TEXTS_EN } from '../src/data/texts.en.js'
import TEXTS_HI from '../src/data/texts.hi.json' with { type: 'json' }
import TEXTS_MR from '../src/data/texts.mr.json' with { type: 'json' }
import COND_HI from '../src/data/conditions.hi.json' with { type: 'json' }
import COND_MR from '../src/data/conditions.mr.json' with { type: 'json' }

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p' })
// 5 Nov 2026, 10:00 IST: day 21 of rabi
const clock = () => new Date('2026-11-05T04:30:00Z')
const calm: Forecast = {
  current: { tempC: 28, feelsLikeC: 30, humidity: 50, windKmh: 8, rainProb: 0, condition: 'clear' },
  daily: Array.from({ length: 7 }, (_, i) => ({ date: addDays('2026-11-05', i), minC: 18, maxC: 30, rainProb: 0, rainMm: 0, windKmh: 8, condition: 'clear' as const })),
}
const NASHIK_FARM = {
  name: 'Ramesh',
  lang: 'en',
  village: 'Niphad',
  district: 'Nashik',
  state: 'Maharashtra',
  lat: 20.08,
  lon: 74.11,
  crops: ['onion', 'soybean'],
  landAcres: 3,
  irrigation: 'drip',
  tankSizeLitres: 16,
  consentAt: null,
}

function setup() {
  const interest: unknown[] = []
  const base = memoryStore()
  const store: Store = { ...base, addSchemeInterest: async (r) => void interest.push(r) }
  const app = createApp({
    config,
    store,
    verifyToken: async () => 'u1',
    forecast: async () => calm,
    mandi: async () => [],
    llm: async () => {
      throw new Error('unused')
    },
    clock,
  })
  const h = { Authorization: 'Bearer x', 'Content-Type': 'application/json' }
  const get = (p: string) => app.request(p, { headers: h })
  const send = (method: string, p: string, body: unknown) => app.request(p, { method, headers: h, body: JSON.stringify(body) })
  return { get, send, interest }
}

describe('GET /soil', () => {
  it('finds the district of a point and its usual soil, without inventing test numbers', async () => {
    const { get } = setup()
    const s = await (await get('/soil?lang=en&lat=20.08&lon=74.11')).json()
    expect(s).toMatchObject({ district: 'Nashik', districtLocal: 'Nashik', soilType: 'black', basis: 'district', samples: 0, nitrogen: null, cycle: null })
    expect(s.tips).toHaveLength(4)
    expect(s.tips.at(-1)).toContain('Nashik')
    expect(s.source).toBe('https://soilhealth.dac.gov.in')
  })

  it('knows the Konkan laterite and gives Marathi names', async () => {
    const { get } = setup()
    const s = await (await get('/soil?lang=mr&lat=16.99&lon=73.3')).json()
    expect(s).toMatchObject({ district: 'Ratnagiri', districtLocal: 'रत्नागिरी', soilType: 'laterite' })
  })

  it('404s outside Maharashtra and without a farm', async () => {
    const { get } = setup()
    const out = await get('/soil?lat=28.61&lon=77.21')
    expect(out.status).toBe(404)
    expect((await out.json()).error.code).toBe('outside_maharashtra')
    expect((await (await get('/soil')).json()).error.code).toBe('no_profile')
  })

  it('uses the saved farm, and the profile takes its soil from the district', async () => {
    const { get, send } = setup()
    const saved = await (await send('PUT', '/farmer/me', { ...NASHIK_FARM, district: 'Ratnagiri' })).json()
    expect(saved).toMatchObject({ soilType: 'laterite', soilSource: 'auto' })
    expect((await (await get('/soil')).json()).district).toBe('Ratnagiri')
  })
})

describe('schemes', () => {
  const small: SchemeAnswers = {
    ownsLand: true,
    landAcres: 3,
    category: 'sc',
    hasBankAccount: true,
    hasAadhaar: true,
    isWoman: true,
    irrigation: 'rainfed',
    incomeTaxPayer: false,
  }
  const ids = (a: SchemeAnswers, eligible = true) => matchSchemes(a, 'en').filter((s) => s.eligible === eligible).map((s) => s.id)

  it('a small SC farmer with land qualifies for the central schemes and Ambedkar, not Birsa Munda', () => {
    expect(ids(small)).toEqual([
      'pm-kisan', 'namo-shetkari', 'pmfby', 'kcc', 'soil-health-card', 'pmksy', 'mahadbt-farm-mech', 'ambedkar',
      'saur-pump', 'shettale', 'fundkar-phalbag', 'midh', 'pm-kmy', 'gopinath-munde', 'rwbcis',
    ])
    expect(ids(small, false)).toEqual(['birsa-munda'])
  })

  it('explains each answer, eligible first', () => {
    const r = matchSchemes({ ...small, incomeTaxPayer: true, hasBankAccount: false }, 'en')
    const pmKisan = r.find((s) => s.id === 'pm-kisan')!
    expect(pmKisan.eligible).toBe(false)
    expect(pmKisan.reasons).toContain('Income tax payers cannot get this scheme.')
    expect(pmKisan.reasons).toContain('You will need a bank account linked to your Aadhaar.')
    expect(r.findIndex((s) => !s.eligible)).toBeGreaterThan(r.findLastIndex((s) => s.eligible))
    const pmksy = r.find((s) => s.id === 'pmksy')!
    expect(pmksy.reasons).toContain('Saves water and labour on your rain-fed farm.')
    expect(pmksy.officialUrl).toBe('https://pmksy.gov.in')
  })

  it('without land: insurance, loans and soil testing, not PM-KISAN', () => {
    const none = { ...small, ownsLand: false, category: 'general' as const }
    expect(ids(none)).toEqual(['pmfby', 'kcc', 'soil-health-card', 'rwbcis'])
  })

  it('solar pump size, farm pond land and the pension follow the land', () => {
    const pump = (landAcres: number) => matchSchemes({ ...small, landAcres }, 'en').find((s) => s.id === 'saur-pump')!.reasons
    expect(pump(2.5)).toContain('With your land you can get a 3 HP pump.')
    expect(pump(4)).toContain('With your land you can get a 5 HP pump.')
    expect(pump(8)).toContain('With your land you can get a 7.5 HP pump.')
    expect(pump(2)).toContain('SC and ST farmers pay a smaller share.')
    expect(ids({ ...small, landAcres: 0.5 }, false)).toContain('shettale')
    expect(ids({ ...small, landAcres: 8 }, false)).toContain('pm-kmy')
    expect(ids({ ...small, incomeTaxPayer: true }, false)).toContain('pm-kmy')
  })

  it('POST /schemes/match validates and answers in Hindi', async () => {
    const { send } = setup()
    const res = await send('POST', '/schemes/match', { answers: small, lang: 'hi' })
    expect(res.status).toBe(200)
    expect((await res.json()).schemes).toHaveLength(16)
    expect((await send('POST', '/schemes/match', { answers: { ownsLand: true } })).status).toBe(422)
  })

  it('POST /schemes/share keeps only fixed-list values and no user id', async () => {
    const { send, interest } = setup()
    const b = await (await send('POST', '/schemes/share', { schemeId: 'pmksy', district: 'aurangabad', crop: 'cannabis', landAcres: 3.4, lang: 'mr' })).json()
    expect(b.status).toBe('sent')
    expect(b.shared).toMatchObject({ schemeId: 'pmksy', district: 'Chhatrapati Sambhajinagar', crop: null, landBand: '2-5', lang: 'mr', day: '2026-11-05' })
    expect(interest).toEqual([b.shared])
    expect(JSON.stringify(interest)).not.toContain('u1')
    expect((await send('POST', '/schemes/share', { schemeId: 'made-up', lang: 'en' })).status).toBe(422)
  })

  it('bands land', () => {
    expect([0.5, 1, 4.9, 5, 12, undefined].map(landBand)).toEqual(['0-1', '1-2', '2-5', '5-10', '10+', null])
  })
})

describe('calendar', () => {
  it('handles spans across the new year', () => {
    expect(occurrence('2026-11-05', '10-15', '01-15')).toEqual({ start: '2026-10-15', end: '2027-01-15' })
    expect(occurrence('2027-01-10', '10-15', '01-15')).toEqual({ start: '2026-10-15', end: '2027-01-15' })
    expect(occurrence('2026-11-05', '06-01', '07-15')).toEqual({ start: '2027-06-01', end: '2027-07-15' })
  })

  it('places each crop in its usual stage today', () => {
    const [onion, soybean] = fieldCrops(['onion', 'soybean', 'rice'], '2026-11-05', 'en')
    expect(onion).toMatchObject({ crop: 'onion', phase: 'sow', stage: 'Rabi onion nursery', stageFrom: '2026-10-15', stageTo: '2026-11-30' })
    expect(onion!.progress).toBeCloseTo(21 / 47, 1)
    expect(onion!.year).toHaveLength(5)
    expect(soybean).toMatchObject({ phase: 'rest' })
  })

  it('GET /calendar: open rabi windows first, best fit first, with why-now lines', async () => {
    const { get, send } = setup()
    await send('PUT', '/farmer/me', NASHIK_FARM)
    const c = await (await get('/calendar?lang=en')).json()
    expect(c).toMatchObject({ season: 'rabi', today: '2026-11-05', currentSeason: 'rabi', onset: null })
    expect(c.seasons.map((s: { name: string }) => s.name)).toEqual(['Kharif', 'Rabi', 'Summer'])
    expect(c.inField.map((f: { crop: string }) => f.crop)).toEqual(['onion', 'soybean'])
    const recs = c.recommendations as { crop: string; suitability: string; status: { phase: string; days: number }; whyNow: { weather: string[]; news: unknown[] }; timeline: unknown[] }[]
    expect(recs.map((r) => r.crop)).toEqual(expect.arrayContaining(['onion', 'wheat', 'gram', 'tomato']))
    expect(recs.every((r) => r.status.phase === 'open')).toBe(true)
    expect(recs.find((r) => r.crop === 'onion')).toMatchObject({ suitability: 'high', status: { phase: 'open', days: 25 } })
    expect(recs[0]!.whyNow.weather[0]).toContain('Dry week ahead')
    expect(recs[0]!.whyNow.news).toEqual([])
    expect(recs[0]!.timeline.length).toBeGreaterThan(2)
  })

  it('a rain-fed farm rates irrigated crops low; another season shows upcoming windows', async () => {
    const { get, send } = setup()
    await send('PUT', '/farmer/me', { ...NASHIK_FARM, irrigation: 'rainfed' })
    const rabi = await (await get('/calendar')).json()
    const byCrop = Object.fromEntries(rabi.recommendations.map((r: { crop: string; suitability: string }) => [r.crop, r.suitability]))
    expect(byCrop).toMatchObject({ onion: 'low', wheat: 'low', gram: 'high' })
    const kharif = await (await get('/calendar?season=kharif')).json()
    expect(kharif.season).toBe('kharif')
    expect(kharif.recommendations.every((r: { status: { phase: string } }) => r.status.phase === 'upcoming')).toBe(true)
    expect(kharif.recommendations.find((r: { crop: string }) => r.crop === 'soybean').sowingWindow).toEqual({ from: '2027-06-15', to: '2027-07-15' })
  })

  it('the brief now shows the farmer\'s crops today', async () => {
    const { get, send } = setup()
    await send('PUT', '/farmer/me', NASHIK_FARM)
    const b = await (await get('/brief')).json()
    expect(b.inField.map((f: { stage: string }) => f.stage)).toEqual(['Rabi onion nursery', 'Off season'])
  })
})

describe('translations', () => {
  const flat = (o: unknown, p = ''): [string, string][] =>
    typeof o === 'string'
      ? [[p, o]]
      : Array.isArray(o)
        ? o.flatMap((x, i) => flat(x, `${p}.${i}`))
        : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))

  it('every Hindi line is Hindi and every Marathi line is Marathi (not the other language)', () => {
    for (const [name, table, lang] of [
      ['texts.hi', TEXTS_HI, 'hi'],
      ['texts.mr', TEXTS_MR, 'mr'],
      ['conditions.hi', COND_HI, 'hi'],
      ['conditions.mr', COND_MR, 'mr'],
    ] as const) {
      const wrong = flat(table).filter(([, v]) => wrongLanguage(v, lang)).map(([k]) => k)
      expect(wrong, `${name} lines in the wrong language`).toEqual([])
    }
  })

  it('every English line has a Hindi and a Marathi version with the same placeholders', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    for (const [lang, table] of [['hi', TEXTS_HI], ['mr', TEXTS_MR]] as const) {
      const t = table as Record<string, string>
      expect(Object.keys(TEXTS_EN).filter((k) => !t[k]), `${lang} missing`).toEqual([])
      expect(Object.keys(TEXTS_EN).filter((k) => t[k] && holes(t[k]) !== holes(TEXTS_EN[k]!)), `${lang} placeholders`).toEqual([])
    }
  })

  it('tells Hindi from Marathi', () => {
    expect(devanagariLang('खेत में पानी कम दें और जलभराव न होने दें।')).toBe('hi')
    expect(devanagariLang('शेतात पाणी कमी द्या आणि पाणी साचू देऊ नका.')).toBe('mr')
  })
})
