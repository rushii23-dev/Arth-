/**
 * One-off: give every Maharashtra APMC market real coordinates, so Sell Smart's distances and
 * transport costs are not "0 km" for every market in the farmer's own district.
 *
 *   npx tsx scripts/geocode-markets.ts scripts/markets-raw.json
 *
 * Input: [market, district] pairs as Agmarknet writes them (from the data.gov.in price history).
 * Each name is looked up with Open-Meteo's free geocoder (public place names only, no user data).
 * A hit counts only if it is in Maharashtra and within 100 km of its district's centre; anything
 * else keeps the district centre, as before. Writes src/data/markets.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { DISTRICTS, canonicalDistrict, haversineKm } from '../src/data/districts.js'

const raw = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as [string, string][]
const MAX_FROM_CENTRE_KM = 100
const NOISE = new Set(
  'apmc market yard sub sanchalit khajgi krushi krishi utpann utpanna bajar bazar samiti samati producer company ltd limited pvt private co op agro agri farmers fpo mandi new old the and of'.split(' '),
)

const clean = (m: string) => m.replace(/\s+/g, ' ').trim() // same as services/mandi.ts cleanMarket

/** Place names worth trying, best first: "APMC Dindori(Vani)" -> Dindori, Vani. */
function candidates(market: string): string[] {
  const base = market.replace(/\bAPMC\b/gi, ' ')
  const inner = [...base.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!)
  const main = base.replace(/\([^)]*\)/g, ' ')
  const out: string[] = []
  const add = (s: string) => {
    const t = s.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
    if (t.length >= 3 && !out.includes(t)) out.push(t)
  }
  const words = (s: string) => s.split(/[\s\-,/]+/).filter((w) => w.length >= 3 && !NOISE.has(w.toLowerCase()))
  add(words(main).join(' '))
  for (const i of inner) add(words(i).join(' '))
  // long names ("... Bajar Samati- Abhona-Kalwan"): the place names are usually at the end
  for (const w of [...words(main)].reverse()) add(w)
  for (const i of inner) for (const w of words(i)) add(w)
  return out.slice(0, 5)
}

/** Marathi place names have several English spellings: Yawal/Yaval, Ambejogai/Ambajogai, Jalana/Jalna. */
function spellings(name: string): string[] {
  const v = [name]
  const add = (s: string) => s !== name && !v.includes(s) && v.push(s)
  add(name.replace(/w/g, 'v'))
  add(name.replace(/v/g, 'w'))
  add(name.replace(/ee/g, 'i').replace(/oo/g, 'u'))
  add(name.replace(/e/, 'a'))
  add(name.replace(/ana$/i, 'na').replace(/iya$/i, 'ia'))
  add(name.replace(/ou/g, 'au').replace(/dh/g, 'd'))
  return v.slice(0, 4)
}

type Hit = { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function lookup(name: string): Promise<Hit[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json&countryCode=IN`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (res.ok) return ((await res.json()) as { results?: Hit[] }).results ?? []
    } catch {
      /* retry */
    }
    await sleep(1500)
  }
  return []
}

// The geocoder gets these wrong or does not know them: the APMC sits in the district's main city.
const PINNED: Record<string, { lat: number; lon: number; place: string }> = {
  'APMC Nasik|Nashik': { lat: 20.0, lon: 73.79, place: 'Nashik (pinned)' },
  'APMC Chattrapati Sambhajinagar|Chhatrapati Sambhajinagar': { lat: 19.88, lon: 75.34, place: 'Chhatrapati Sambhajinagar (pinned)' },
}
const points: Record<string, { lat: number; lon: number; place: string }> = { ...PINNED }
let found = 0
let missed: string[] = []
for (const [m, d] of raw) {
  const district = canonicalDistrict(d)
  const centre = district ? DISTRICTS[district] : undefined
  if (!district || !centre) {
    missed.push(`${m} (${d}: unknown district)`)
    continue
  }
  const key = `${clean(m)}|${district}`
  if (points[key]) continue
  let hit: Hit | undefined
  for (const name of candidates(m).flatMap(spellings)) {
    const results = await lookup(name)
    await sleep(120)
    const inState = results.filter((r) => r.admin1 === 'Maharashtra')
    const km = (r: Hit) => haversineKm(centre, { lat: r.latitude, lon: r.longitude })
    // near the district centre, or (large districts) named as being in the same district
    hit =
      inState.find((r) => km(r) <= MAX_FROM_CENTRE_KM) ??
      inState.find((r) => km(r) <= 200 && canonicalDistrict((r.admin2 ?? '').replace(/ District$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')) === district)
    if (hit) break
  }
  if (hit) {
    points[key] = { lat: Math.round(hit.latitude * 1000) / 1000, lon: Math.round(hit.longitude * 1000) / 1000, place: hit.name }
    found++
  } else missed.push(`${m} (${district})`)
}

const lines = Object.entries(points)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, p]) => `  ${JSON.stringify(k)}: { lat: ${p.lat}, lon: ${p.lon} }, // ${p.place}`)
writeFileSync(
  new URL('../src/data/markets.ts', import.meta.url),
  `// Generated by scripts/geocode-markets.ts from Agmarknet market names and Open-Meteo's geocoder.
// Key: "<market as Agmarknet writes it>|<district>". Markets not listed fall back to their district centre.
export const MARKET_POINTS: Record<string, { lat: number; lon: number }> = {
${lines.join('\n')}
}
`,
)
console.log(`found ${found} of ${raw.length}; missed ${missed.length}`)
console.log(missed.slice(0, 60).join('\n'))
