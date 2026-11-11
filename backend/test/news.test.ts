import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { isOfficialUrl, newsDocId, type GroundedSearch } from '../src/services/news.js'
import { memoryStore } from '../src/store/memory.js'

const config = loadConfig({ ARTH_ENV: 'test', ARTH_FIREBASE_PROJECT_ID: 'p', GEMINI_API_KEY: 'k' })
const NOW = new Date('2026-11-11T06:30:00Z') // 12:00 IST

const profile = {
  name: 'Ramesh Patil',
  lang: 'mr',
  village: 'Niphad',
  district: 'nashik',
  state: 'Maharashtra',
  lat: 20.08,
  lon: 74.11,
  crops: ['onion'],
  landAcres: 3,
  irrigation: 'drip',
  tankSizeLitres: 16,
  consentAt: '2026-11-05T10:00:00Z',
}

const item = (url: string, over: Record<string, unknown> = {}) => ({
  headline: { en: 'Light rain likely on 13 Nov', hi: '13 नवंबर को हल्की बारिश', mr: '13 नोव्हेंबरला हलका पाऊस' },
  summary: { en: 'Delay spraying onion by two days.', hi: 'प्याज़ पर छिड़काव दो दिन टालें।', mr: 'कांद्यावर फवारणी दोन दिवस पुढे ढकला.' },
  source: 'IMD Pune',
  url,
  date: '2026-11-10',
  ...over,
})

/** A fake grounded model: returns `items` and grounds on `sources` (redirect links), counting calls. */
function fakeSearch(items: unknown[], sources: string[]) {
  const calls: { model: string; system: string; prompt: string }[] = []
  const search: GroundedSearch = async (req) => {
    calls.push(req)
    return {
      text: 'Here is what I found:\n```json\n' + JSON.stringify({ items }) + '\n```',
      sources: sources.map((s, i) => ({ uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${i}`, title: new URL(s).hostname })),
    }
  }
  // the "redirect" resolves to the real page
  const resolve = async (uri: string) => sources[Number(uri.split('/').pop())] ?? null
  return { search, resolve, calls }
}

async function setup(search: GroundedSearch, resolve: (u: string) => Promise<string | null>) {
  const store = memoryStore()
  const app = createApp({
    config,
    store,
    verifyToken: async () => 'u1',
    forecast: async () => {
      throw new Error('unused')
    },
    mandi: async () => [],
    llm: async () => {
      throw new Error('unused')
    },
    clock: () => NOW,
    newsSearch: search,
    resolveLink: resolve,
  })
  const put = await app.request('/farmer/me', {
    method: 'PUT',
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  expect(put.status).toBe(200)
  const get = (lang = 'mr') => app.request(`/news?lang=${lang}`, { headers: { Authorization: 'Bearer x' } })
  return { app, store, get }
}

describe('official sources', () => {
  it('accepts government, NIC, ICAR and state agri-university hosts', () => {
    for (const u of [
      'https://mausam.imd.gov.in/mumbai/',
      'https://krishi.maharashtra.gov.in/1001/Home',
      'https://nashik.nic.in/notice/x',
      'https://pib.gov.in/PressReleasePage.aspx?PRID=1',
      'https://icar.org.in/node/1',
      'https://dogr.icar.gov.in/advisory',
      'https://www.mpkv.ac.in/news',
    ])
      expect(isOfficialUrl(u), u).toBe(true)
  })
  it('rejects news sites, look-alike hosts and odd URLs', () => {
    for (const u of [
      'https://timesofindia.indiatimes.com/city/nashik/x',
      'https://gov.in.example.com/x',
      'https://imd.gov.in.evil.net/x',
      'https://fakegov.in/x',
      'ftp://imd.gov.in/x',
      'https://user:pw@imd.gov.in/x',
      'not a url',
    ])
      expect(isOfficialUrl(u), u).toBe(false)
  })
})

describe('GET /news', () => {
  it("keeps only items from official pages the search really returned, in the farmer's language", async () => {
    const imd = 'https://mausam.imd.gov.in/imd_latest/contents/agromet/advisory/nashik.pdf'
    const krishi = 'https://krishi.maharashtra.gov.in/1229/Notice'
    const { search, resolve, calls } = fakeSearch(
      [
        item(imd),
        // official link, but the search never returned it: invented, dropped
        item('https://pib.gov.in/made-up-page', { headline: { en: 'Invented', hi: 'x', mr: 'x' } }),
        // a newspaper, even though it was in the search results
        item('https://www.lokmat.com/nashik/onion-news', { headline: { en: 'Newspaper', hi: 'x', mr: 'x' } }),
        // the model wrote a slightly different path on a grounded official site: the grounded page is linked instead
        item('https://krishi.maharashtra.gov.in/some/other/path', { source: 'Krishi Vibhag', date: '2026-11-09' }),
      ],
      [imd, 'https://www.lokmat.com/nashik/onion-news', krishi],
    )
    const { get } = await setup(search, resolve)
    const res = await get('mr')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.district).toBe('Nashik')
    expect(body.date).toBe('2026-11-11')
    expect(body.model).toBe('gemini-2.5-flash')
    expect(body.items).toEqual([
      { headline: '13 नोव्हेंबरला हलका पाऊस', summary: 'कांद्यावर फवारणी दोन दिवस पुढे ढकला.', source: 'IMD Pune', url: imd, date: '2026-11-10' },
      expect.objectContaining({ source: 'Krishi Vibhag', url: krishi, date: '2026-11-09' }),
    ])
    // the model sees only the district and the date: never the farmer's name or village
    expect(calls).toHaveLength(1)
    expect(calls[0]!.prompt).toContain('Nashik')
    expect(calls[0]!.prompt).toContain('2026-11-11')
    expect(JSON.stringify(calls[0])).not.toMatch(/Ramesh|Niphad|Patil/)
    expect(calls[0]!.model).toBe('gemini-2.5-flash')
  })

  it('asks once per district per day: every language and every later request reads the cache', async () => {
    const imd = 'https://mausam.imd.gov.in/x.pdf'
    const { search, resolve, calls } = fakeSearch([item(imd)], [imd])
    const { get, store } = await setup(search, resolve)
    const [a, b] = await Promise.all([get('mr'), get('mr')])
    expect((await a.json()).items).toHaveLength(1)
    expect((await b.json()).items).toHaveLength(1)
    expect((await (await get('en')).json()).items[0].headline).toBe('Light rain likely on 13 Nov')
    expect((await (await get('hi')).json()).items[0].headline).toBe('13 नवंबर को हल्की बारिश')
    expect(calls).toHaveLength(1)
    expect(await store.getDistrictNews(newsDocId('Nashik', '2026-11-11'))).not.toBeNull()
  })

  it('returns and caches an empty list when nothing official is found', async () => {
    const { search, resolve, calls } = fakeSearch([item('https://www.agrowon.com/x')], ['https://www.agrowon.com/x'])
    const { get } = await setup(search, resolve)
    expect((await (await get()).json()).items).toEqual([])
    expect((await (await get()).json()).items).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('drops stale or future-dated items and masks PII', async () => {
    const page = 'https://nashik.nic.in/notice/'
    const { search, resolve } = fakeSearch(
      [
        item(page, { date: '2026-08-01' }),
        item(page, { date: '2026-12-25', headline: { en: 'Future', hi: 'x', mr: 'x' } }),
        item(page, { summary: { en: 'Call 98765 43210 to apply.', hi: 'x', mr: 'x' }, headline: { en: 'Apply now', hi: 'x', mr: 'x' } }),
      ],
      [page],
    )
    const { get } = await setup(search, resolve)
    const body = await (await get('en')).json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].summary).toBe('Call [phone] to apply.')
  })

  it('is quietly empty, not an error, when the AI is down; nothing is cached', async () => {
    let n = 0
    const search: GroundedSearch = async () => {
      n++
      throw new Error('quota')
    }
    const { get, store } = await setup(search, async (u) => u)
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ district: 'Nashik', date: '2026-11-11', items: [], model: null })
    // not retried straight away
    await get()
    expect(n).toBe(1)
    expect(await store.getDistrictNews(newsDocId('Nashik', '2026-11-11'))).toBeNull()
  })

  it('ignores a reply that is not JSON', async () => {
    const search: GroundedSearch = async () => ({ text: 'Sorry, no news today.', sources: [] })
    const { get } = await setup(search, async (u) => u)
    expect((await (await get()).json()).items).toEqual([])
  })

  it('needs a profile', async () => {
    const app = createApp({
      config,
      store: memoryStore(),
      verifyToken: async () => 'nobody',
      forecast: async () => {
        throw new Error('unused')
      },
      mandi: async () => [],
      llm: async () => {
        throw new Error('unused')
      },
    })
    expect((await app.request('/news', { headers: { Authorization: 'Bearer x' } })).status).toBe(404)
  })
})
