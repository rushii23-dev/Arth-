import { z } from 'zod'
import { cropName } from '../data/crops.js'
import type { LangCode } from '../lib/time.js'
import type { Llm } from './llm.js'
import { redact, redactDeep, type PiiKind } from './pii.js'

export interface Media {
  mimeType: string
  data: Uint8Array
}

export interface AiModels {
  vision: string
  audio: string
}

const LANGUAGE: Record<LangCode, string> = {
  en: 'simple English',
  hi: 'simple Hindi in Devanagari script',
  mr: 'simple Marathi in Devanagari script',
}

const COMMON = (lang: LangCode) =>
  `You help small farmers in Maharashtra, India. Write every text field in ${LANGUAGE[lang]}, ` +
  `short and plain, as you would speak to a farmer. Never invent facts. When unsure, say so and lower the confidence.`

// lenient field types: models sometimes return 85 for 0.85, or omit empty lists
const confidence = z.coerce.number().transform((n) => Math.min(1, Math.max(0, n > 1 ? n / 100 : n)))
const list = z.array(z.string().trim().min(1)).catch([]).default([])
const text = z.string().trim()

/** Below this the app sends the farmer to the Kisan Call Centre instead of trusting the answer. */
export const ESCALATE_BELOW = 0.6

// ---- Crop doctor -------------------------------------------------------------------

const CropReply = z.object({
  isPlant: z.boolean().catch(true).default(true),
  // Gemma sends null here for a photo that is not a plant (seen live)
  diagnosis: z.string().trim().nullable().catch(null).default(null).transform((s) => s ?? ''),
  scientificName: z.string().trim().nullable().catch(null).default(null),
  confidence,
  severity: z.enum(['low', 'medium', 'high']).catch('medium'),
  symptoms: list,
  treatment: z.object({ organic: list, chemical: list }).catch({ organic: [], chemical: [] }),
  prevention: list,
})

export async function cropDoctor(llm: Llm, models: AiModels, image: Media, lang: LangCode, crop?: string) {
  const r = await llm({
    model: models.vision,
    system:
      `${COMMON(lang)} You are a crop doctor. Look at the photo of a plant and name the most likely disease, pest ` +
      `or deficiency. For chemical treatment name the active ingredient only, never a dose: the farmer reads the dose ` +
      `from the product label. If the photo is not a plant, or too blurry to judge, set isPlant false or confidence below 0.5.`,
    parts: [
      { media: image },
      { text: crop ? `The farmer says this is ${cropName(crop, 'en')}.` : 'The farmer did not say which crop this is.' },
    ],
    schema: CropReply,
    shape:
      '{"isPlant":true,"diagnosis":"…","scientificName":"… or null","confidence":0.0,"severity":"low|medium|high",' +
      '"symptoms":["…"],"treatment":{"organic":["…"],"chemical":["…"]},"prevention":["…"]}',
  })
  const { isPlant, ...rest } = r
  const out = redactDeep(rest).value
  return {
    ...out,
    confidence: isPlant ? out.confidence : 0,
    escalate: !isPlant || out.confidence < ESCALATE_BELOW,
    model: models.vision,
  }
}

// ---- Label reader ------------------------------------------------------------------

const LabelReply = z.object({
  productName: text,
  activeIngredient: text,
  formulation: z.string().trim().nullable().catch(null).default(null),
  printedDose: z
    .object({
      amount: z.coerce.number().positive(),
      unit: z.enum(['ml', 'g']),
      perLitres: z.coerce.number().positive().max(1000),
    })
    .nullable()
    .catch(null)
    .default(null),
  waitingPeriodDays: z.coerce.number().int().min(0).max(365).nullable().catch(null).default(null),
  safety: list,
  warnings: list,
  confidence,
})

/** Scale a printed per-litre (or per-tank) dose to the farmer's tank. Never guessed: no printed dose, no number. */
export function scaleDose(dose: { amount: number; unit: 'ml' | 'g'; perLitres: number } | null, tankLitres: number) {
  if (!dose) return null
  const amount = Math.round(((dose.amount * tankLitres) / dose.perLitres) * 10) / 10
  return amount > 0 && Number.isFinite(amount) ? { amount, unit: dose.unit } : null
}

export async function labelReader(llm: Llm, models: AiModels, image: Media, lang: LangCode, tankSizeLitres: number) {
  const r = await llm({
    model: models.vision,
    system:
      `${COMMON(lang)} You read pesticide and fertiliser labels. Copy the product name, active ingredient and ` +
      `formulation exactly as printed. For printedDose, give ONLY a dose that is printed on the label for mixing in ` +
      `water, with the amount of water it is for (for example 2 ml per 1 litre, or 30 ml per 15 litre tank). ` +
      `If the label gives only a per-acre dose, or no dose, or you cannot read it clearly, printedDose must be null. ` +
      `Never calculate or guess a dose. List safety steps and warnings from the label.`,
    parts: [{ media: image }, { text: `The farmer's sprayer tank holds ${tankSizeLitres} litres.` }],
    schema: LabelReply,
    shape:
      '{"productName":"…","activeIngredient":"…","formulation":"25% EC or null",' +
      '"printedDose":{"amount":2,"unit":"ml","perLitres":1} or null,"waitingPeriodDays":7 or null,' +
      '"safety":["…"],"warnings":["…"],"confidence":0.0}',
  })
  const { printedDose, ...rest } = r
  const out = redactDeep(rest).value
  const dosePerTank = scaleDose(printedDose, tankSizeLitres)
  return {
    ...out,
    dosePerTank,
    tankSizeLitres,
    escalate: dosePerTank === null || out.confidence < ESCALATE_BELOW,
    model: models.vision,
  }
}

// ---- Document explainer --------------------------------------------------------------

const PII_KINDS = ['Aadhaar', 'PAN', 'IFSC', 'Bank account', 'Phone', 'Email'] as const

const DocReply = z.object({
  docType: text,
  summary: text,
  keyPoints: list,
  deadlines: z
    .array(z.object({ label: text, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable().catch(null))
    .catch([])
    .default([])
    .transform((d) => d.filter((x): x is { label: string; date: string } => x !== null)),
  nextSteps: list,
  personalFieldsSeen: z
    .array(z.string())
    .catch([])
    .default([])
    .transform((xs) => xs.filter((x): x is PiiKind => (PII_KINDS as readonly string[]).includes(x))),
})

export async function explainDocument(llm: Llm, models: AiModels, image: Media, lang: LangCode) {
  const r = await llm({
    model: models.vision,
    system:
      `${COMMON(lang)} You explain government, bank and insurance papers (7/12 extract, bank notice, crop insurance ` +
      `letter, scheme letter…). Say what the paper is, what it means for the farmer, any dates they must act by ` +
      `(as YYYY-MM-DD) and what to do next. NEVER copy any personal number or contact: no Aadhaar, PAN, IFSC, bank ` +
      `account, phone, email, names or addresses. In personalFieldsSeen list only the KINDS present on the paper, ` +
      `from: ${PII_KINDS.join(', ')}.`,
    parts: [{ media: image }],
    schema: DocReply,
    shape:
      '{"docType":"…","summary":"…","keyPoints":["…"],"deadlines":[{"label":"…","date":"2026-12-31"}],' +
      '"nextSteps":["…"],"personalFieldsSeen":["Aadhaar"]}',
  })
  const { personalFieldsSeen, ...rest } = r
  const { value, found } = redactDeep(rest)
  personalFieldsSeen.forEach((k) => found.add(k))
  return { ...value, redactedFields: PII_KINDS.filter((k) => found.has(k)), model: models.vision }
}

// ---- Voice ---------------------------------------------------------------------------

/** Screens the voice assistant may open (frontend app/router.tsx). */
export const ROUTES = ['/', '/weather', '/doctor', '/label', '/kagaz', '/mandi', '/calendar', '/schemes', '/profile', '/settings'] as const

const ROUTE_HELP =
  '/ home and today\'s advice; /weather weather; /doctor crop disease photo; /label read a pesticide label; ' +
  '/kagaz explain a document; /mandi market prices and when to sell; /calendar what to sow; ' +
  '/schemes government schemes; /profile and /settings the farmer\'s details'

const VoiceReply = z.object({
  transcript: text.catch(''),
  reply: text.catch(''),
  intent: z.enum(['navigate', 'question', 'fill_form', 'unknown']).catch('unknown'),
  navigateTo: z.string().nullable().catch(null).default(null),
  slots: z.record(z.string(), z.coerce.string()).catch({}).default({}),
})

export async function voice(
  llm: Llm,
  models: AiModels,
  audio: Media,
  lang: LangCode,
  context: { screen: string; formFields?: string[] },
) {
  const fields = context.formFields ?? []
  const r = await llm({
    model: models.audio,
    system:
      `${COMMON(lang)} You are Arth's voice assistant. Write down exactly what the farmer said (transcript, in the ` +
      `language spoken), then decide: navigate to a screen, answer a short farming question, fill form fields, or ` +
      `unknown. Screens: ${ROUTE_HELP}. Keep the reply to one or two sentences.`,
    parts: [
      { media: audio },
      {
        text:
          `The farmer is on the "${context.screen}" screen.` +
          (fields.length ? ` Form fields on screen: ${fields.join(', ')}. For fill_form put values in slots by field name.` : ''),
      },
    ],
    schema: VoiceReply,
    shape: '{"transcript":"…","reply":"…","intent":"navigate|question|fill_form|unknown","navigateTo":"/mandi or null","slots":{"field":"value"}}',
  })
  const navigateTo = r.intent === 'navigate' && (ROUTES as readonly string[]).includes(r.navigateTo ?? '') ? r.navigateTo : null
  const slots = r.intent === 'fill_form' ? Object.fromEntries(Object.entries(r.slots).filter(([k]) => fields.includes(k))) : {}
  const intent = r.intent === 'navigate' && !navigateTo ? 'unknown' : r.intent
  const transcript = redact(r.transcript).text
  return {
    transcript,
    reply: redact(r.reply).text,
    intent,
    navigateTo,
    // form values are what the farmer said, but still never echo an ID number back
    slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, redact(v).text])),
    escalate: intent === 'unknown' || !transcript,
    model: models.audio,
  }
}
