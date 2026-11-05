/**
 * One-off: translate the crop doctor's knowledge (src/data/conditions.ts) into Hindi and Marathi
 * and write src/data/conditions.{hi,mr}.json. Run again only after editing the English, then
 * review and commit the JSON. At runtime nothing is translated, so the text never changes.
 *
 *   npx tsx --env-file=.env scripts/translate-conditions.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { z } from 'zod'
import { CONDITIONS } from '../src/data/conditions.js'

const LANGS = { hi: 'Hindi', mr: 'Marathi' } as const
// Rotated on each retry so one overloaded model cannot stall the run.
const MODELS = (process.env.TRANSLATE_MODELS ?? 'gemma-4-31b-it,gemini-3.5-flash,gemma-4-26b-a4b-it').split(',')
const thinking = (model: string) =>
  model.startsWith('gemma-')
    ? { thinkingLevel: ThinkingLevel.MINIMAL }
    : model.startsWith('gemini-2.5')
      ? { thinkingBudget: 0 }
      : { thinkingLevel: ThinkingLevel.LOW }
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const Entry = z.object({
  name: z.string().min(1),
  symptoms: z.array(z.string().min(1)),
  organic: z.array(z.string()),
  chemical: z.array(z.string()),
  prevention: z.array(z.string()),
})
type Entry = z.infer<typeof Entry>

async function translate(lang: keyof typeof LANGS, c: (typeof CONDITIONS)[number]): Promise<Entry> {
  const source = { name: c.name, symptoms: c.symptoms, organic: c.organic, chemical: c.chemical, prevention: c.prevention }
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt))
    try {
      const res = await ai.models.generateContent({
        model: MODELS[attempt % MODELS.length]!,
        contents:
          `Translate this crop-protection advice for small farmers in Maharashtra into simple, everyday ${LANGS[lang]} ` +
          `in Devanagari script. Use the words farmers actually say (for example the usual local name of the disease or pest). ` +
          `Keep the names of chemicals and products (Mancozeb, Fipronil, Trichoderma, Bordeaux mixture, NPV, Bt ...) in English letters. ` +
          `Keep exactly the same JSON keys and the same number of items in every list, in the same order. Do not add advice.\n\n` +
          JSON.stringify(source),
        config: {
          temperature: 0,
          topK: 1,
          seed: 7,
          responseMimeType: 'application/json',
          thinkingConfig: thinking(MODELS[attempt % MODELS.length]!),
        },
      })
      const raw = JSON.parse(res.text ?? '')
      const out = Entry.parse(Array.isArray(raw) ? raw[0] : raw)
      for (const k of ['symptoms', 'organic', 'chemical', 'prevention'] as const) {
        if (out[k].length !== source[k].length) throw new Error(`${k} has ${out[k].length} items, expected ${source[k].length}`)
      }
      return out
    } catch (e) {
      console.warn(`retry ${c.id} ${lang} (${MODELS[attempt % MODELS.length]}): ${(e as Error).message.slice(0, 120)}`)
    }
  }
  throw new Error(`could not translate ${c.id} into ${lang}`)
}

// Resumable: entries already in the file are kept, and the file is saved after every entry.
// Translate a stale entry again by deleting it from the JSON. Pass a language (hi|mr) to do only that one.
const only = process.argv[2] as keyof typeof LANGS | undefined
for (const lang of (only ? [only] : Object.keys(LANGS)) as (keyof typeof LANGS)[]) {
  const file = new URL(`../src/data/conditions.${lang}.json`, import.meta.url)
  const out: Record<string, Entry> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  for (const c of CONDITIONS) {
    if (out[c.id]) continue
    out[c.id] = await translate(lang, c)
    writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  }
  console.log(`wrote conditions.${lang}.json (${Object.keys(out).length} entries)`)
}
