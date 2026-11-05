import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CONDITIONS, conditionById, conditionsFor, UNKNOWN_ID, type Condition } from '../data/conditions.js'
import hi from '../data/conditions.hi.json' with { type: 'json' }
import mr from '../data/conditions.mr.json' with { type: 'json' }
import { cropName } from '../data/crops.js'
import { t } from '../lib/i18n.js'
import type { LangCode } from '../lib/time.js'
import type { Llm } from './llm.js'

/**
 * Crop doctor. The model does ONE job: look at the photo and pick which listed problem it shows.
 * The farmer then reads checked advice from data/conditions.ts, never model-written text, so the
 * same problem always gets the same advice, and the same photo always gets the same answer.
 */

export interface CropDiagnosis {
  diagnosis: string
  scientificName: string | null
  confidence: number
  severity: 'low' | 'medium' | 'high'
  symptoms: string[]
  treatment: { organic: string[]; chemical: string[] }
  prevention: string[]
  escalate: boolean
  model: string
}

type Localized = Pick<Condition, 'name' | 'symptoms' | 'organic' | 'chemical' | 'prevention'>
const TRANSLATIONS: Record<'hi' | 'mr', Record<string, Localized>> = { hi, mr }

/** Below this the app sends the farmer to the Kisan Call Centre instead of trusting the answer. */
export const ESCALATE_BELOW = 0.6

const score = z.coerce.number().transform((n) => Math.min(1, Math.max(0, n > 1 ? n / 100 : n)))

const Reply = z.object({
  // written first so the model looks before it labels; never shown to the farmer
  seen: z.string().catch(''),
  isPlant: z.boolean().catch(true).default(true),
  photoClear: z.boolean().catch(true).default(true),
  conditionId: z.string().trim().catch(UNKNOWN_ID),
  confidence: score.catch(0),
  runnerUpId: z.string().trim().nullable().catch(null).default(null),
  runnerUpConfidence: score.catch(0).default(0),
  severity: z.enum(['low', 'medium', 'high']).catch('medium'),
})

/** When the second choice is this close to the first, the photo is ambiguous: send the farmer to an expert. */
const CLOSE_CALL = 0.25

function prompt(candidates: Condition[], crop?: string) {
  const list = candidates
    .map((c) => `- ${c.id}: ${c.name} on ${cropName(c.crop, 'en')}${c.scientificName ? ` (${c.scientificName})` : ''}. Looks like: ${c.looksLike}.`)
    .join('\n')
  return {
    system:
      'You are a plant doctor for crops in Maharashtra, India. Look carefully at the photo, then choose the ONE ' +
      'condition from the list below whose "looks like" matches what you can actually see. Compare the photo with ' +
      'every description before choosing. If nothing on the list clearly matches, or the photo is not a plant, or ' +
      `it is too dark, blurry or far away to judge, answer "${UNKNOWN_ID}". Never guess: a wrong disease costs the ` +
      'farmer money. First, in "seen", describe in one sentence exactly what you see: which part of the plant, the ' +
      'colour, and the texture (spots, rings, powder, fluffy tufts, holes, insects). Then choose. Some problems look ' +
      'alike (for example downy and powdery mildew): compare your "seen" with both descriptions word by word. ' +
      'confidence is how sure you are that this exact condition is right (0 to 1). Give your second choice as ' +
      'runnerUpId with its own confidence, or null. severity is low when a few spots or leaves are affected, medium ' +
      'when many leaves are, high when most of the plant or the fruit is.\n\n' +
      `Conditions:\n${list}\n- ${UNKNOWN_ID}: none of the above, not a plant, or the photo is unclear.`,
    note: crop ? `The farmer says this is ${cropName(crop, 'en')}.` : 'The farmer did not say which crop this is.',
  }
}

function localize(c: Condition, lang: LangCode): Localized {
  return (lang !== 'en' && TRANSLATIONS[lang][c.id]) || c
}

/** Exact same photo, crop and language: same answer, without asking the model again. Only a hash is kept, never the photo. */
export type DoctorCache = Map<string, { at: number; value: CropDiagnosis }>
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000
const CACHE_MAX = 1000

export async function cropDoctor(
  llm: Llm,
  model: string,
  image: { mimeType: string; data: Uint8Array },
  lang: LangCode,
  crop: string | undefined,
  cache: DoctorCache,
  now = Date.now,
): Promise<CropDiagnosis> {
  const key = [createHash('sha256').update(image.data).digest('hex'), crop ?? '-', lang, model].join('|')
  const hit = cache.get(key)
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value

  const candidates = conditionsFor(crop)
  const { system, note } = prompt(candidates.length ? candidates : CONDITIONS, crop)
  const r = await llm({
    model,
    system,
    parts: [{ media: image }, { text: note }],
    schema: Reply,
    shape:
      '{"seen":"…","isPlant":true,"photoClear":true,"conditionId":"onion.purple_blotch","confidence":0.0,' +
      '"runnerUpId":"onion.stemphylium_blight or null","runnerUpConfidence":0.0,"severity":"low|medium|high"}',
  })

  const condition = r.isPlant && r.photoClear ? conditionById(r.conditionId) : undefined
  // a crop the farmer named rules out the other crops' problems
  const fits = condition && (!crop || condition.crop === crop)
  const value = fits ? known(condition, r, lang, model) : unknown(lang, model)

  cache.set(key, { at: now(), value })
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return value
}

function known(c: Condition, r: z.infer<typeof Reply>, lang: LangCode, model: string): CropDiagnosis {
  const text = localize(c, lang)
  const healthy = c.kind === 'healthy'
  const chemical = text.chemical.length ? [...text.chemical, t(lang, 'doctor.labelNote')] : []
  return {
    diagnosis: text.name,
    scientificName: c.scientificName,
    confidence: Math.round(r.confidence * 100) / 100,
    severity: healthy ? 'low' : r.severity,
    symptoms: text.symptoms,
    treatment: { organic: text.organic, chemical },
    prevention: text.prevention,
    escalate: r.confidence < ESCALATE_BELOW || closeCall(r),
    model,
  }
}

/** A real second candidate nearly as likely as the first. */
const closeCall = (r: z.infer<typeof Reply>) =>
  !!r.runnerUpId && r.runnerUpId !== r.conditionId && conditionById(r.runnerUpId) !== undefined && r.confidence - r.runnerUpConfidence < CLOSE_CALL

function unknown(lang: LangCode, model: string): CropDiagnosis {
  return {
    diagnosis: t(lang, 'doctor.unknown'),
    scientificName: null,
    confidence: 0,
    severity: 'low',
    symptoms: [t(lang, 'doctor.unknownDetail')],
    treatment: { organic: [], chemical: [] },
    prevention: [t(lang, 'doctor.retakeTip')],
    escalate: true,
    model,
  }
}
