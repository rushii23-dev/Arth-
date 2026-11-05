/**
 * One-off: translate src/data/texts.en.ts into Hindi and Marathi and write texts.{hi,mr}.json.
 * Resumable (keys already in the file are kept) and saved after every batch. Translate a key
 * again by deleting it from the JSON. Review and commit the result; nothing is translated at runtime.
 *
 *   npx tsx --env-file=.env scripts/translate-texts.ts [hi|mr]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { TEXTS_EN } from '../src/data/texts.en.js'

const LANGS = { hi: 'Hindi', mr: 'Marathi' } as const
const MODELS = (process.env.TRANSLATE_MODELS ?? 'gemma-4-31b-it,gemma-4-26b-a4b-it').split(',')
const BATCH = 15
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

async function translateBatch(lang: keyof typeof LANGS, batch: Record<string, string>) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt))
    const model = MODELS[attempt % MODELS.length]!
    try {
      const res = await ai.models.generateContent({
        model,
        contents:
          `Translate the values of this JSON object into simple, everyday ${LANGS[lang]} in Devanagari script, ` +
          `for small farmers in Maharashtra. Use the words farmers actually say. Keep the keys exactly. Keep every ` +
          `{placeholder} exactly as it is. Keep scheme names, chemical and product names, "7/12", "Rhizobium", ` +
          `"Trichoderma", "MahaDBT", "PM-KISAN" and the ₹ amounts recognisable. Do not add anything.\n\n` +
          JSON.stringify(batch),
        config: {
          temperature: 0,
          topK: 1,
          seed: 7,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      })
      const raw = JSON.parse(res.text ?? '')
      const out = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>
      for (const [k, v] of Object.entries(batch)) {
        const t = out[k]
        if (typeof t !== 'string' || !t.trim()) throw new Error(`missing ${k}`)
        if (placeholders(t) !== placeholders(v)) throw new Error(`placeholders changed in ${k}`)
      }
      return out as Record<string, string>
    } catch (e) {
      console.warn(`retry ${lang} (${model}): ${(e as Error).message.slice(0, 120)}`)
    }
  }
  throw new Error(`could not translate a batch into ${lang}`)
}

const only = process.argv[2] as keyof typeof LANGS | undefined
for (const lang of (only ? [only] : Object.keys(LANGS)) as (keyof typeof LANGS)[]) {
  const file = new URL(`../src/data/texts.${lang}.json`, import.meta.url)
  const out: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const todo = Object.keys(TEXTS_EN).filter((k) => !out[k])
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = Object.fromEntries(todo.slice(i, i + BATCH).map((k) => [k, TEXTS_EN[k]!]))
    Object.assign(out, await translateBatch(lang, batch))
    // keep the English key order so diffs stay readable
    const ordered = Object.fromEntries(Object.keys(TEXTS_EN).filter((k) => out[k]).map((k) => [k, out[k]]))
    writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n')
    console.log(`${lang}: ${Object.keys(ordered).length}/${Object.keys(TEXTS_EN).length}`)
  }
}
console.log('DONE')
