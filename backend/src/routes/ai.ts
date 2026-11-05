import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthVars } from '../auth.js'
import { CROPS } from '../data/crops.js'
import { ApiError, badRequest } from '../errors.js'
import { Lang } from '../schemas.js'
import { explainDocument, labelReader, voice, type AiModels, type Media } from '../services/ai.js'
import { cropDoctor, type DoctorCache } from '../services/doctor.js'
import type { Llm } from '../services/llm.js'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** 15 s of opus is ~60 KB; 2 MB allows any codec a phone picks. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024

/** Per farmer: AI calls cost money and the free tier is small. */
const AI_CALLS_PER_MINUTE = 6

type Form = Record<string, string | File | (string | File)[]>

async function readForm(c: { req: { parseBody: () => Promise<Form> } }): Promise<Form> {
  try {
    return await c.req.parseBody()
  } catch {
    throw badRequest('invalid_form', 'Expected multipart/form-data')
  }
}

/** SPEC §5.3: media is read into memory, sent to the model and dropped. Nothing is written anywhere. */
async function media(form: Form, field: string, types: string[], maxBytes: number): Promise<Media> {
  const f = form[field]
  if (!(f instanceof File)) throw badRequest(`missing_${field}`, `Attach the ${field}`)
  const mimeType = f.type.split(';')[0]!.trim().toLowerCase()
  if (!types.includes(mimeType)) throw new ApiError(415, `bad_${field}_type`, `${field} must be ${types.join(', ')}`)
  if (f.size > maxBytes) throw new ApiError(413, 'too_large', `${field} is over ${Math.round(maxBytes / 1024 / 1024)} MB`)
  if (f.size === 0) throw badRequest(`empty_${field}`, `The ${field} is empty`)
  return { mimeType, data: new Uint8Array(await f.arrayBuffer()) }
}

function field<T extends z.ZodType>(schema: T, form: Form, name: string): z.infer<T> {
  const v = form[name]
  const parsed = schema.safeParse(typeof v === 'string' ? v : undefined)
  if (!parsed.success) throw badRequest('invalid_field', `${name}: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  return parsed.data
}

const VoiceContext = z.object({
  screen: z.string().trim().min(1).max(40),
  formFields: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})

export function rateLimiter(perMinute: number, now = Date.now) {
  const hits = new Map<string, number[]>()
  return (uid: string) => {
    const t = now()
    const recent = (hits.get(uid) ?? []).filter((x) => t - x < 60_000)
    if (recent.length >= perMinute) throw new ApiError(429, 'too_many_requests', 'Too many requests, wait a minute')
    recent.push(t)
    hits.set(uid, recent)
    if (hits.size > 10_000) hits.delete(hits.keys().next().value!)
  }
}

export function aiRoutes(deps: { llm: Llm; models: AiModels; limit?: (uid: string) => void }) {
  const r = new Hono<{ Variables: AuthVars }>()
  const limit = deps.limit ?? rateLimiter(AI_CALLS_PER_MINUTE)
  const doctorCache: DoctorCache = new Map()
  r.use('*', async (c, next) => {
    limit(c.get('uid'))
    // SPEC §3: AI answers are never cached
    c.header('Cache-Control', 'no-store')
    await next()
  })

  r.post('/crop-doctor', async (c) => {
    const form = await readForm(c)
    const image = await media(form, 'image', IMAGE_TYPES, MAX_IMAGE_BYTES)
    const lang = field(Lang.default('en'), form, 'lang')
    const crop = field(z.string().refine((x) => x in CROPS).optional(), form, 'crop')
    return c.json(await cropDoctor(deps.llm, deps.models.vision, image, lang, crop, doctorCache))
  })

  r.post('/label-reader', async (c) => {
    const form = await readForm(c)
    const image = await media(form, 'image', IMAGE_TYPES, MAX_IMAGE_BYTES)
    const lang = field(Lang.default('en'), form, 'lang')
    const tank = field(z.coerce.number().positive().max(1000), form, 'tankSizeLitres')
    return c.json(await labelReader(deps.llm, deps.models, image, lang, tank))
  })

  r.post('/explain-document', async (c) => {
    const form = await readForm(c)
    if (form.consent !== 'true') throw badRequest('consent_required', 'The farmer must agree before a document is read')
    const image = await media(form, 'image', IMAGE_TYPES, MAX_IMAGE_BYTES)
    const lang = field(Lang.default('en'), form, 'lang')
    return c.json(await explainDocument(deps.llm, deps.models, image, lang))
  })

  r.post('/voice', async (c) => {
    const form = await readForm(c)
    const audio = await media(form, 'audio', AUDIO_TYPES, MAX_AUDIO_BYTES)
    const lang = field(Lang.default('en'), form, 'lang')
    let context: z.infer<typeof VoiceContext>
    try {
      context = VoiceContext.parse(JSON.parse(String(form.context ?? '{"screen":"home"}')))
    } catch {
      throw badRequest('invalid_field', 'context must be JSON like {"screen":"home"}')
    }
    return c.json(await voice(deps.llm, deps.models, audio, lang, context))
  })

  return r
}
