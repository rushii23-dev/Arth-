import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { rateLimiter } from '../src/routes/ai.js'
import { scaleDose } from '../src/services/ai.js'
import { extractJson, type JsonRequest, type Llm } from '../src/services/llm.js'
import { redact } from '../src/services/pii.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p', GEMINI_API_KEY: 'k' })

/** A fake model: returns `reply` after validating it with the route's own schema, like the real client. */
function fakeLlm(reply: unknown) {
  const calls: JsonRequest<never>[] = []
  const llm: Llm = async (req) => {
    calls.push(req as unknown as JsonRequest<never>)
    return req.schema.parse(reply)
  }
  return { llm, calls }
}

function appWith(reply: unknown) {
  const { llm, calls } = fakeLlm(reply)
  const app = createApp({
    config,
    store: memoryStore(),
    verifyToken: async () => 'u1',
    forecast: async () => {
      throw new Error('unused')
    },
    mandi: async () => [],
    llm,
    aiLimit: () => {},
  })
  return { app, calls }
}

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], 'leaf.jpg', { type: 'image/jpeg' })

function post(app: ReturnType<typeof createApp>, path: string, fields: Record<string, string | File>) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return app.request(path, { method: 'POST', headers: { Authorization: 'Bearer x' }, body: form })
}

describe('PII redaction', () => {
  it('masks Aadhaar, PAN, IFSC, account, phone and email', () => {
    const r = redact(
      'Aadhaar 2345 6789 0123, PAN ABCDE1234F, IFSC SBIN0001234, A/c 123456789012345, call +91 98765 43210 or a.b@x.in',
    )
    expect(r.text).toBe('Aadhaar [Aadhaar], PAN [PAN], IFSC [IFSC], A/c [account], call [phone] or [email]')
    expect(new Set(r.found)).toEqual(new Set(['Aadhaar', 'PAN', 'IFSC', 'Bank account', 'Phone', 'Email']))
  })
  it('leaves prices, dates and doses alone', () => {
    const s = '₹1,25,000 by 2026-12-31, 30 ml per 15 litre tank, 7/12 extract'
    expect(redact(s)).toEqual({ text: s, found: [] })
  })
})

describe('model replies', () => {
  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Here: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } })
    expect(() => extractJson('no json')).toThrow()
  })
})

describe('POST /ai/crop-doctor', () => {
  const reply = {
    isPlant: true,
    diagnosis: 'Purple blotch',
    scientificName: 'Alternaria porri',
    confidence: 85,
    severity: 'medium',
    symptoms: ['Purple spots with yellow rims'],
    treatment: { organic: ['Neem oil spray'], chemical: ['Mancozeb'] },
    prevention: ['Avoid overhead irrigation'],
  }

  it('returns the SPEC shape, turns 85 into 0.85, and sends no personal data', async () => {
    const { app, calls } = appWith(reply)
    const res = await post(app, '/ai/crop-doctor', { image: jpeg(), lang: 'mr', crop: 'onion' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const b = await res.json()
    expect(b).toEqual({ ...reply, isPlant: undefined, confidence: 0.85, escalate: false, model: 'gemma-4-26b-a4b-it' })
    expect(calls[0]!.model).toBe('gemma-4-26b-a4b-it')
    expect(calls[0]!.system).toContain('Marathi')
    expect(JSON.stringify(calls[0]!.parts.filter((p) => 'text' in p))).toBe('[{"text":"The farmer says this is Onion."}]')
  })

  it('escalates when unsure or when the photo is not a plant', async () => {
    expect((await (await post(appWith({ ...reply, confidence: 0.4 }).app, '/ai/crop-doctor', { image: jpeg() })).json()).escalate).toBe(true)
    const notPlant = await (await post(appWith({ ...reply, isPlant: false }).app, '/ai/crop-doctor', { image: jpeg() })).json()
    expect(notPlant).toMatchObject({ escalate: true, confidence: 0 })
  })

  it('rejects a missing image, a wrong type and a non-multipart body', async () => {
    const { app } = appWith(reply)
    expect((await post(app, '/ai/crop-doctor', { lang: 'en' })).status).toBe(400)
    const gif = new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' })
    expect((await post(app, '/ai/crop-doctor', { image: gif })).status).toBe(415)
    const json = await app.request('/ai/crop-doctor', { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: '{}' })
    expect(json.status).toBe(400)
  })
})

describe('POST /ai/label-reader', () => {
  const reply = {
    productName: 'Curacron',
    activeIngredient: 'Profenofos',
    formulation: '50% EC',
    printedDose: { amount: 2, unit: 'ml', perLitres: 1 },
    waitingPeriodDays: 10,
    safety: ['Wear gloves and a mask'],
    warnings: ['Toxic to fish'],
    confidence: 0.9,
  }

  it('scales the printed dose to the tank in code', async () => {
    const b = await (await post(appWith(reply).app, '/ai/label-reader', { image: jpeg(), lang: 'en', tankSizeLitres: '16' })).json()
    expect(b).toMatchObject({ dosePerTank: { amount: 32, unit: 'ml' }, tankSizeLitres: 16, escalate: false })
    expect(b.printedDose).toBeUndefined()
  })

  it('never guesses: no printed dose means no dose and escalate', async () => {
    const b = await (await post(appWith({ ...reply, printedDose: null }).app, '/ai/label-reader', { image: jpeg(), tankSizeLitres: '15' })).json()
    expect(b).toMatchObject({ dosePerTank: null, escalate: true })
  })

  it('needs the tank size', async () => {
    expect((await post(appWith(reply).app, '/ai/label-reader', { image: jpeg() })).status).toBe(400)
  })

  it('scales per-tank doses too', () => {
    expect(scaleDose({ amount: 30, unit: 'ml', perLitres: 15 }, 16)).toEqual({ amount: 32, unit: 'ml' })
    expect(scaleDose(null, 16)).toBeNull()
  })
})

describe('POST /ai/explain-document', () => {
  const reply = {
    docType: 'Bank notice',
    summary: 'Your crop loan on account 123456789012 is due.',
    keyPoints: ['Call 9876543210 for help'],
    deadlines: [{ label: 'Repay loan', date: '2026-12-31' }, { label: 'bad', date: 'soon' }],
    nextSteps: ['Visit the branch'],
    personalFieldsSeen: ['Aadhaar', 'Name'],
  }

  it('requires consent', async () => {
    const res = await post(appWith(reply).app, '/ai/explain-document', { image: jpeg() })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('consent_required')
  })

  it('redacts what the model repeats and lists every kind seen', async () => {
    const b = await (await post(appWith(reply).app, '/ai/explain-document', { image: jpeg(), consent: 'true', lang: 'hi' })).json()
    // starts with 1, so an account number, not an Aadhaar (those start 2-9)
    expect(b.summary).toBe('Your crop loan on account [account] is due.')
    expect(b.keyPoints).toEqual(['Call [phone] for help'])
    expect(b.deadlines).toEqual([{ label: 'Repay loan', date: '2026-12-31' }])
    // Aadhaar from the model's own list (it saw one on the paper), the rest from redaction
    expect(b.redactedFields).toEqual(['Aadhaar', 'Bank account', 'Phone'])
  })
})

describe('POST /ai/voice', () => {
  const audio = () => new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'v.webm', { type: 'audio/webm;codecs=opus' })

  it('navigates only to real screens, using the audio model', async () => {
    const { app, calls } = appWith({ transcript: 'कांद्याचा भाव दाखव', reply: 'बाजारभाव उघडत आहे', intent: 'navigate', navigateTo: '/mandi', slots: {} })
    const b = await (await post(app, '/ai/voice', { audio: audio(), lang: 'mr', context: '{"screen":"home"}' })).json()
    expect(b).toEqual({ transcript: 'कांद्याचा भाव दाखव', reply: 'बाजारभाव उघडत आहे', intent: 'navigate', navigateTo: '/mandi', slots: {}, escalate: false, model: 'gemini-2.5-flash' })
    expect(calls[0]!.model).toBe('gemini-2.5-flash')

    const bad = await (await post(appWith({ transcript: 'x', reply: 'y', intent: 'navigate', navigateTo: '/admin', slots: {} }).app, '/ai/voice', { audio: audio() })).json()
    expect(bad).toMatchObject({ intent: 'unknown', navigateTo: null, escalate: true })
  })

  it('keeps only slots for fields on screen', async () => {
    const reply = { transcript: 'my village is Niphad', reply: 'ok', intent: 'fill_form', navigateTo: null, slots: { village: 'Niphad', password: 'x' } }
    const b = await (await post(appWith(reply).app, '/ai/voice', { audio: audio(), context: '{"screen":"schemes.apply","formFields":["village"]}' })).json()
    expect(b.slots).toEqual({ village: 'Niphad' })
  })

  it('rejects bad context JSON', async () => {
    expect((await post(appWith({}).app, '/ai/voice', { audio: audio(), context: 'nope' })).status).toBe(400)
  })
})

describe('limits and config', () => {
  it('allows a burst per farmer, then 429s', () => {
    let t = 0
    const limit = rateLimiter(2, () => t)
    limit('a')
    limit('a')
    expect(() => limit('a')).toThrow(expect.objectContaining({ status: 429 }))
    limit('b')
    t = 61_000
    expect(() => limit('a')).not.toThrow()
  })

  it('reports the model on /health', async () => {
    const b = await (await appWith({}).app.request('/health')).json()
    expect(b).toMatchObject({ ok: true, model: 'gemma-4-26b-a4b-it', modelReady: true })
  })
})

it('a missing API key gives 503 ai_not_configured', async () => {
  const { gemini } = await import('../src/services/llm.js')
  const llm = gemini('')
  await expect(llm({ model: 'm', system: '', parts: [], schema: (await import('zod')).z.object({}), shape: '{}' })).rejects.toMatchObject({
    status: 503,
    code: 'ai_not_configured',
  })
  expect(vi.isMockFunction(llm)).toBe(false)
})
