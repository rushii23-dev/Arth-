import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { DISTRICTS } from '../data/districts.js'
import { ApiError } from '../errors.js'
import { addDays, type Clock, type LangCode } from '../lib/time.js'
import { extractJson } from './llm.js'
import { redactDeep } from './pii.js'

/**
 * Daily farm news for a district, from official sources only.
 *
 * Once per district per day, Gemini is asked, with Google Search grounding, for today's farming news
 * in that Maharashtra district (IMD warnings and agromet advisories, scheme deadlines, APMC notices,
 * Krishi Vibhag and ICAR advisories), written in English, Hindi and Marathi in the same answer.
 * Only items whose link is a page the search actually returned, on an official host (*.gov.in,
 * *.nic.in, ICAR, the state agricultural universities), are kept; everything else is dropped and
 * nothing is ever made up. The day's answer, even an empty one, is cached in the store, so all three
 * languages for all 36 districts cost at most 36 grounded prompts a day.
 */

export type GroundedSource = { uri: string; title: string }

/** One grounded model call: the reply text and the web pages it was grounded on. */
export type GroundedSearch = (req: { model: string; system: string; prompt: string }) => Promise<{ text: string; sources: GroundedSource[] }>

/** Resolves a Google grounding redirect link to the page it points to (null when it cannot). */
export type ResolveLink = (uri: string) => Promise<string | null>

export interface NewsItem {
  headline: string
  summary: string
  source: string
  url: string
  date: string
}

export interface DistrictNews {
  district: string
  date: string
  items: NewsItem[]
  /** null when nothing was asked (district outside Maharashtra, AI not set up, or AI unavailable) */
  model: string | null
}

type L3 = Record<LangCode, string>
interface StoredItem {
  headline: L3
  summary: L3
  source: string
  url: string
  date: string
}
/** What the store keeps for a district and day: every language at once. */
export interface NewsDoc {
  district: string
  date: string
  model: string
  fetchedAt: string
  items: StoredItem[]
}

/** Hosts we treat as official: Indian government, NIC, ICAR and Maharashtra's agricultural universities. */
const OFFICIAL_SUFFIXES = ['.gov.in', '.nic.in', '.icar.org.in', '.icar.gov.in']
const OFFICIAL_HOSTS = new Set([
  'icar.org.in',
  'mpkv.ac.in', // Mahatma Phule Krishi Vidyapeeth, Rahuri
  'vnmkv.ac.in', // Vasantrao Naik Marathwada Krishi Vidyapeeth, Parbhani
  'pdkv.ac.in', // Dr. Panjabrao Deshmukh Krishi Vidyapeeth, Akola
  'dbskkv.org', // Dr. Balasaheb Sawant Konkan Krishi Vidyapeeth, Dapoli
])

export function isOfficialUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  if (u.username || u.password || u.port) return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  return OFFICIAL_HOSTS.has(host) || OFFICIAL_SUFFIXES.some((s) => host.endsWith(s) || `.${host}` === s)
}

const hostOf = (raw: string) => {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}
/** Same page for matching: no fragment, no trailing slash, host case ignored. */
const samePage = (raw: string) => {
  try {
    const u = new URL(raw)
    u.hash = ''
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`
  } catch {
    return raw
  }
}

const Text = z.string().trim().min(1).max(220)
const Reply = z.object({
  items: z
    .array(
      z.object({
        headline: z.object({ en: Text, hi: Text, mr: Text }),
        summary: z.object({ en: Text, hi: Text, mr: Text }),
        source: z.string().trim().min(1).max(80),
        url: z.string().trim().min(1).max(600),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .max(10),
})

const SHAPE = `{"items":[{"headline":{"en":"…","hi":"…","mr":"…"},"summary":{"en":"…","hi":"…","mr":"…"},"source":"India Meteorological Department","url":"https://…","date":"YYYY-MM-DD"}]}`

const SYSTEM = [
  "You find today's farming news for one district of Maharashtra, India, for small farmers.",
  'Search the web. Use ONLY official government sources: India Meteorological Department (imd.gov.in, mausam.imd.gov.in),',
  'Maharashtra Krishi Vibhag (krishi.maharashtra.gov.in), PIB (pib.gov.in), the Ministry of Agriculture (agriwelfare.gov.in),',
  'ICAR and its institutes, Agmarknet / APMC notices, district collector sites (*.nic.in) and other *.gov.in or *.nic.in pages.',
  'Look for: IMD weather warnings and agromet advisories for the district, government scheme deadlines,',
  'APMC / mandi notices, and Krishi Vibhag or ICAR crop advisories that apply to the district now.',
  'Never use news websites, blogs, social media or any non-government page. Never invent an item, a date or a link.',
  'Each item must come from one page you found; give that exact page URL and its publication or issue date.',
  'Write each headline in at most 12 words and each summary as one plain sentence a farmer understands,',
  'in English (en), Hindi (hi) and Marathi (mr, Devanagari). Keep numbers, dates and names exact.',
  'At most 6 items, the most useful first. If you find nothing official and recent, return {"items":[]}.',
].join(' ')

/** At most this many items reach the farmer. */
const MAX_ITEMS = 4
/** Older items are not "today's" news. */
const MAX_AGE_DAYS = 30
/** After a failed fetch, the district is not asked again on this server for this long. */
const RETRY_AFTER_MS = 20 * 60_000

/** Store document id: district (letters only) and the IST day. */
export const newsDocId = (district: string, date: string) => `${district.replace(/[^A-Za-z]/g, '')}_${date}`

export function newsService(deps: {
  search: GroundedSearch
  resolve: ResolveLink
  model: string
  store: { getDistrictNews(id: string): Promise<NewsDoc | null>; putDistrictNews(id: string, doc: NewsDoc): Promise<void> }
  clock: Clock
  warn?: (msg: string, extra: Record<string, unknown>) => void
}) {
  const inFlight = new Map<string, Promise<NewsDoc>>()
  const failedAt = new Map<string, number>()

  async function fetchDay(district: string, date: string): Promise<NewsDoc> {
    const prompt = [
      `District: ${district}, Maharashtra (${DISTRICTS[district]?.dev ?? district}).`,
      `Today is ${date}. Find official farming news for this district from the last ${MAX_AGE_DAYS} days, newest first.`,
    ].join('\n')
    const { text, sources } = await deps.search({ model: deps.model, system: SYSTEM, prompt: `${prompt}\nAnswer with ONE JSON object only, shaped exactly like:\n${SHAPE}` })

    // the pages the search really returned, resolved from Google's redirect links, official ones only
    const grounded = (await Promise.all(sources.map(async (s) => (await deps.resolve(s.uri)) ?? null))).filter(
      (u): u is string => !!u && isOfficialUrl(u),
    )
    const byPage = new Map(grounded.map((u) => [samePage(u), u]))
    const byHost = new Map<string, string>()
    for (const u of grounded) if (!byHost.has(hostOf(u))) byHost.set(hostOf(u), u)

    let reply: z.infer<typeof Reply>
    try {
      const parsed = Reply.safeParse(extractJson(text))
      reply = parsed.success ? parsed.data : { items: [] }
    } catch {
      reply = { items: [] }
    }

    const oldest = addDays(date, -MAX_AGE_DAYS)
    const seen = new Set<string>()
    const items: StoredItem[] = []
    for (const it of reply.items) {
      // a link the model wrote is only trusted when the search returned that page, or at least
      // that official site (then the farmer gets the page the search returned, never a guessed path)
      const url = byPage.get(samePage(it.url)) ?? (isOfficialUrl(it.url) ? byHost.get(hostOf(it.url)) : undefined)
      if (!url) continue
      if (it.date < oldest || it.date > addDays(date, 1)) continue
      const key = samePage(url) + '|' + it.headline.en.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ headline: it.headline, summary: it.summary, source: it.source, url, date: it.date })
      if (items.length === MAX_ITEMS) break
    }
    // SPEC §5.4: nothing with PII is returned or stored
    const clean = redactDeep(items).value
    clean.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return { district, date, model: deps.model, fetchedAt: deps.clock().toISOString(), items: clean }
  }

  /** Today's news for a district, in one language; never throws for an AI failure (empty instead). */
  return async function districtNews(district: string, date: string, lang: LangCode): Promise<DistrictNews> {
    const empty: DistrictNews = { district, date, items: [], model: null }
    if (!DISTRICTS[district]) return empty
    const id = newsDocId(district, date)

    let doc = await deps.store.getDistrictNews(id).catch(() => null)
    if (!doc) {
      const failed = failedAt.get(id)
      if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) return empty
      let job = inFlight.get(id)
      if (!job) {
        job = fetchDay(district, date).then(async (d) => {
          await deps.store.putDistrictNews(id, d).catch((e: unknown) => deps.warn?.('news cache write failed', { kind: (e as Error)?.name }))
          return d
        })
        inFlight.set(id, job)
        void job.finally(() => inFlight.delete(id)).catch(() => {})
      }
      try {
        doc = await job
        failedAt.delete(id)
      } catch (e) {
        failedAt.set(id, Date.now())
        const code = e instanceof ApiError ? e.code : (e as Error)?.name
        deps.warn?.('district news failed', { district, code })
        return empty
      }
    }
    return {
      district,
      date,
      model: doc.model,
      items: doc.items.map((i) => ({ headline: i.headline[lang], summary: i.summary[lang], source: i.source, url: i.url, date: i.date })),
    }
  }
}

export type NewsService = ReturnType<typeof newsService>

/** Gemini with Google Search grounding. JSON mode cannot be combined with the search tool, so the JSON is read from the text. */
export function geminiSearch(apiKey: string, timeoutMs = 40_000): GroundedSearch {
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null
  return async ({ model, system, prompt }) => {
    if (!ai || !model) throw new ApiError(503, 'ai_not_configured', 'AI is not set up on this server')
    const start = performance.now()
    let res
    try {
      res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: system,
          tools: [{ googleSearch: {} }],
          temperature: 0,
          maxOutputTokens: 4000,
          thinkingConfig: model.startsWith('gemini-2.5') ? { thinkingBudget: 0 } : undefined,
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      })
    } catch (err) {
      const status = (err as { status?: number }).status
      console.log(JSON.stringify({ severity: 'WARNING', msg: 'news model call failed', model, status, kind: err instanceof Error ? err.name : typeof err }))
      if (status === 429) throw new ApiError(503, 'ai_busy', 'The AI is busy')
      throw new ApiError(502, 'ai_unavailable', 'The AI did not answer')
    }
    const meta = res.candidates?.[0]?.groundingMetadata
    const sources = (meta?.groundingChunks ?? [])
      .map((c) => ({ uri: c.web?.uri ?? '', title: c.web?.title ?? '' }))
      .filter((s) => s.uri)
    // counts and timing only (SPEC §5.9)
    console.log(
      JSON.stringify({
        severity: 'INFO',
        msg: 'news model call',
        model,
        ms: Math.round(performance.now() - start),
        sources: sources.length,
        queries: meta?.webSearchQueries?.length ?? 0,
        tokensOut: res.usageMetadata?.candidatesTokenCount,
      }),
    )
    return { text: res.text ?? '', sources }
  }
}

const REDIRECT_HOST = 'vertexaisearch.cloud.google.com'

/** Follows Google's grounding redirect once (no body is read) to learn the real page address. */
export function resolveGroundingLink(timeoutMs = 4_000): ResolveLink {
  return async (uri) => {
    let u: URL
    try {
      u = new URL(uri)
    } catch {
      return null
    }
    if (u.hostname !== REDIRECT_HOST) return u.toString()
    try {
      const res = await fetch(u, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
      void res.body?.cancel().catch(() => {})
      const loc = res.headers.get('location')
      return loc ? new URL(loc, u).toString() : null
    } catch {
      return null
    }
  }
}
