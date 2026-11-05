import { TEXTS_EN } from '../data/texts.en.js'
import hi from '../data/texts.hi.json' with { type: 'json' }
import mr from '../data/texts.mr.json' with { type: 'json' }
import type { LangCode } from './time.js'

/** Soil, scheme and calendar wording: committed translations, never generated at runtime. */
const TABLES: Record<LangCode, Record<string, string>> = { en: TEXTS_EN, hi, mr }

export function tx(lang: LangCode, key: string, vars: Record<string, string | number> = {}): string {
  const template = TABLES[lang][key] ?? TEXTS_EN[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}

export const hasText = (key: string) => key in TEXTS_EN
