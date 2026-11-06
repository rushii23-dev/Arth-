import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { CONDITIONS } from '../src/data/conditions.js'
import { CROPS, cropName, isCoreCrop, isCrop } from '../src/data/crops.js'
import type { Llm } from '../src/services/llm.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p', GEMINI_API_KEY: 'k' })
const frontend = (path: string) => readFileSync(new URL(`../../frontend/src/${path}`, import.meta.url), 'utf8')

describe('crop catalog', () => {
  it('names every crop in English, Hindi and Marathi and gives it an Agmarknet name', () => {
    for (const [id, c] of Object.entries(CROPS)) {
      expect(c.agmarknet.length, id).toBeGreaterThan(0)
      expect(c.name.en.length, id).toBeGreaterThan(0)
      expect(/[ऀ-ॿ]/.test(c.name.hi), `${id} hi`).toBe(true)
      expect(/[ऀ-ॿ]/.test(c.name.mr), `${id} mr`).toBe(true)
    }
    expect(new Set(Object.values(CROPS).map((c) => c.agmarknet)).size).toBe(Object.keys(CROPS).length)
  })

  it('uses the Agmarknet 2.0 commodity names, not the retired ones that no longer get prices', () => {
    const retired = [
      'Paddy(Dhan)(Common)', 'Ragi (Finger Millet)', 'Arhar (Tur/Red Gram)(Whole)', 'Green Gram (Moong)(Whole)',
      'Black Gram (Urd Beans)(Whole)', 'Sunflower', 'Mango', 'Custard Apple (Sharifa)', 'Lemon', 'Capsicum',
    ]
    for (const [id, c] of Object.entries(CROPS)) expect(retired, id).not.toContain(c.agmarknet)
  })

  it('has checked crop doctor advice for every core crop and only for core crops', () => {
    const covered = new Set(CONDITIONS.map((c) => c.crop))
    expect([...covered].sort()).toEqual(Object.keys(CROPS).filter(isCoreCrop).sort())
  })

  it('matches the frontend catalog and its translations', () => {
    const src = frontend('lib/crops.ts')
    const block = (name: string) => src.slice(src.indexOf(name), src.indexOf('as const', src.indexOf(name)))
    const ids = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    const core = ids(block('CORE_CROPS ='))
    const more = ids(block('MORE_CROP_GROUPS ='))
    expect(core.sort()).toEqual(Object.keys(CROPS).filter(isCoreCrop).sort())
    expect(more.sort()).toEqual(Object.keys(CROPS).filter((c) => !isCoreCrop(c)).sort())
    for (const lang of ['en', 'hi', 'mr']) {
      const names = JSON.parse(frontend(`i18n/locales/${lang}.json`)).common.crops as Record<string, string>
      expect(Object.keys(names).sort(), lang).toEqual(Object.keys(CROPS).sort())
    }
  })

  it('only takes its own ids, never object built-ins', () => {
    expect(isCrop('tur')).toBe(true)
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', undefined, null]) expect(isCrop(id), String(id)).toBe(false)
    expect(isCoreCrop('onion')).toBe(true)
    expect(isCoreCrop('tur')).toBe(false)
    expect(cropName('tur', 'mr')).toBe('तूर')
    expect(cropName('Dragon fruit', 'mr')).toBe('Dragon fruit')
    expect(cropName('constructor', 'en')).toBe('constructor')
  })
})

describe('routes with crops beyond the core list', () => {
  const asked: string[] = []
  const prompts: string[] = []
  const llm: Llm = async (req) => {
    prompts.push(req.system ?? '')
    return req.schema.parse({ isPlant: true, photoClear: true, conditionId: 'unknown', confidence: 0, severity: 'low' })
  }
  const app = createApp({
    config,
    store: memoryStore(),
    verifyToken: async () => 'u1',
    forecast: async () => {
      throw new Error('unused')
    },
    mandi: async (c) => {
      asked.push(c)
      return []
    },
    llm,
    aiLimit: () => {},
  })
  const h = { Authorization: 'Bearer x' }

  it('looks up mandi prices for an "Other crops" pick and refuses anything outside the catalog', async () => {
    const tur = await app.request('/mandi/prices?commodity=tur&lat=20&lon=74', { headers: h })
    expect(tur.status).toBe(404) // accepted; the fake source simply has no prices
    expect(asked).toContain('tur')
    for (const c of ['constructor', 'Dragon fruit']) {
      expect((await app.request(`/mandi/prices?commodity=${encodeURIComponent(c)}&lat=20&lon=74`, { headers: h })).status, c).toBe(400)
    }
  })

  it('checks a photo of any crop the farmer grows against every known problem', async () => {
    for (const crop of ['tur', 'Dragon fruit']) {
      const form = new FormData()
      form.append('image', new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], 'leaf.jpg', { type: 'image/jpeg' }))
      form.append('crop', crop)
      const res = await app.request('/ai/crop-doctor', { method: 'POST', headers: h, body: form })
      expect(res.status, crop).toBe(200)
      // no checked list for this crop: the model is not narrowed to one crop's problems
      expect(prompts.at(-1)).toContain('onion.')
      expect(prompts.at(-1)).toContain('tomato.')
    }
  })
})
