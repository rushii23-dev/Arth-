import { CROPS, isCrop } from '../data/crops.js'
import { canonicalDistrict, DISTRICTS, haversineKm, ROAD_FACTOR } from '../data/districts.js'
import { ApiError } from '../errors.js'
import { addDays, daysBetween } from '../lib/time.js'

/** One market's price on one day, ₹/quintal. */
export interface PriceRecord {
  market: string
  district: string
  date: string // YYYY-MM-DD
  minPrice: number
  maxPrice: number
  modalPrice: number
}

export interface MarketPrice {
  market: string
  district: string
  minPrice: number
  maxPrice: number
  modalPrice: number
  distanceKm: number
  arrivalDate: string
}

export interface PricePoint {
  date: string
  modalPrice: number
}

/** All recent Maharashtra price records for a commodity id ('onion', ...). */
export type MandiSource = (commodity: string) => Promise<PriceRecord[]>

// ---- data.gov.in (Agmarknet) --------------------------------------------------

const API = 'https://api.data.gov.in/resource'
/** "Current Daily Price of Various Commodities from Various Markets (Mandi)": today only. */
const TODAY_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070'
/** "Variety-wise Daily Market Prices Data of Commodity": history since 2010, oldest first. */
const HISTORY_RESOURCE = '35985678-0d79-46b4-9ed6-6f13308a1d24'
const HISTORY_TAIL = 1000

const toIso = (ddmmyyyy: string) => {
  const [d, m, y] = ddmmyyyy.split('/')
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
}
const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')))
const cleanMarket = (m: string) => m.replace(/\s+/g, ' ').trim()

function toRecord(r: Record<string, unknown>): PriceRecord | null {
  const get = (k: string) => r[k] ?? r[k.toLowerCase()]
  const modal = num(get('Modal_Price'))
  const date = String(get('Arrival_Date') ?? '')
  if (!Number.isFinite(modal) || modal <= 0 || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) return null
  return {
    market: cleanMarket(String(get('Market') ?? '')),
    district: canonicalDistrict(String(get('District') ?? '')) ?? String(get('District') ?? '').trim(),
    date: toIso(date),
    minPrice: num(get('Min_Price')) || modal,
    maxPrice: num(get('Max_Price')) || modal,
    modalPrice: modal,
  }
}

export function dataGovIn(apiKey: string, fetchFn: typeof fetch = fetch): MandiSource {
  async function call(resource: string, params: Record<string, string | number>) {
    const qs = new URLSearchParams({ 'api-key': apiKey, format: 'json' })
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
    let res: Response
    try {
      res = await fetchFn(`${API}/${resource}?${qs}`, { signal: AbortSignal.timeout(25_000) })
    } catch {
      throw new ApiError(502, 'mandi_unavailable', 'Mandi price service did not answer')
    }
    if (res.status === 429) throw new ApiError(503, 'mandi_rate_limited', 'Mandi price service is busy, try again soon')
    if (!res.ok) throw new ApiError(502, 'mandi_unavailable', `Mandi price service error ${res.status}`)
    return (await res.json()) as { total?: number; records?: Record<string, unknown>[] }
  }

  return async (commodity) => {
    const name = isCrop(commodity) ? CROPS[commodity]!.agmarknet : undefined
    if (!name) throw new ApiError(404, 'unknown_commodity', `No mandi prices for ${commodity}`)
    if (!apiKey) throw new ApiError(503, 'mandi_not_configured', 'Mandi prices are not set up on this server')

    const historyFilter = { 'filters[State]': 'Maharashtra', 'filters[Commodity]': name }
    const history = async () => {
      const head = await call(HISTORY_RESOURCE, { ...historyFilter, limit: 1 })
      const total = head.total ?? 0
      return total > 0
        ? await call(HISTORY_RESOURCE, { ...historyFilter, limit: HISTORY_TAIL, offset: Math.max(0, total - HISTORY_TAIL) })
        : { records: [] }
    }
    // the two feeds fail independently: one answering is enough to show prices
    const [todayRes, tailRes] = await Promise.allSettled([
      call(TODAY_RESOURCE, { 'filters[state.keyword]': 'Maharashtra', 'filters[commodity]': name, limit: 1000 }),
      history(),
    ])
    if (todayRes.status === 'rejected' && tailRes.status === 'rejected') throw todayRes.reason
    const today = todayRes.status === 'fulfilled' ? todayRes.value : { records: [] }
    const tail = tailRes.status === 'fulfilled' ? tailRes.value : { records: [] }

    // today's feed wins over history for the same market and day
    const byKey = new Map<string, PriceRecord>()
    for (const raw of [...(tail.records ?? []), ...(today.records ?? [])]) {
      const rec = toRecord(raw)
      if (rec) byKey.set(`${rec.market}|${rec.date}`, rec)
    }
    return [...byKey.values()]
  }
}

/** Where the last good prices per commodity are kept across restarts (Firestore, or a local file). */
export interface MandiSnapshots {
  getMandiSnapshot(commodity: string): Promise<{ savedAt: string; records: PriceRecord[] } | null>
  putMandiSnapshot(commodity: string, snapshot: { savedAt: string; records: PriceRecord[] }): Promise<void>
}

/** Snapshots keep only what `analyse` reads: the latest price per market and a 30-day trend. */
const SNAPSHOT_DAYS = 45
/** After a failed refresh, wait this long before asking the rate-limited API again. */
const RETRY_AFTER_MS = 60_000

function recent(records: PriceRecord[]): PriceRecord[] {
  const newest = records.reduce((m, r) => (r.date > m ? r.date : m), '')
  if (!newest) return records
  const since = addDays(newest, -SNAPSHOT_DAYS)
  return records.filter((r) => r.date >= since)
}

/**
 * The price API is rate-limited, and prices change once a day: cache per commodity,
 * share in-flight requests, and keep serving the last good answer if a refresh fails.
 * With `snapshots`, the last good answer also survives restarts and new Cloud Run instances.
 */
export function cachedMandi(
  source: MandiSource,
  ttlMs = 3 * 60 * 60_000,
  now = Date.now,
  snapshots?: MandiSnapshots,
  log: (msg: string, extra: Record<string, unknown>) => void = () => {},
): MandiSource {
  const fresh = new Map<string, { at: number; value: Promise<PriceRecord[]> }>()
  const lastGood = new Map<string, PriceRecord[]>()

  async function fromSnapshot(commodity: string) {
    if (!snapshots) return null
    try {
      const snap = await snapshots.getMandiSnapshot(commodity)
      return snap?.records.length ? snap.records : null
    } catch (err) {
      log('mandi snapshot read failed', { commodity, error: String(err) })
      return null
    }
  }

  return (commodity) => {
    const hit = fresh.get(commodity)
    if (hit && now() - hit.at < ttlMs) return hit.value
    const value = source(commodity).then(
      (records) => {
        lastGood.set(commodity, records)
        if (snapshots && records.length) {
          snapshots
            .putMandiSnapshot(commodity, { savedAt: new Date(now()).toISOString(), records: recent(records) })
            .catch((err) => log('mandi snapshot write failed', { commodity, error: String(err) }))
        }
        return records
      },
      async (err) => {
        log('mandi refresh failed', { commodity, error: String(err) })
        // don't hit the API again on every request while it is failing
        fresh.set(commodity, { at: now() - ttlMs + RETRY_AFTER_MS, value })
        const stale = lastGood.get(commodity) ?? (await fromSnapshot(commodity))
        if (stale) {
          lastGood.set(commodity, stale)
          return stale
        }
        throw err
      },
    )
    fresh.set(commodity, { at: now(), value })
    return value
  }
}

// ---- Analysis ----------------------------------------------------------------------

/** Markets farther than this are not worth the truck. */
export const MAX_MARKET_KM = 300
/** A market's last price counts as current for this many days. */
const CURRENT_DAYS = 10
const MAX_MARKETS = 15

function marketPoint(rec: PriceRecord) {
  const d = DISTRICTS[rec.district]
  return d ? { lat: d.lat, lon: d.lon } : null
}

export const roadKm = (from: { lat: number; lon: number }, to: { lat: number; lon: number }) =>
  Math.round(haversineKm(from, to) * ROAD_FACTOR)

export interface MandiView {
  asOf: string
  markets: MarketPrice[]
  trend: PricePoint[]
  trendMarket: string
  changePct7d: number
}

/** Latest price per nearby market, the 30-day trend of the nearest busy market, and its 7-day change. */
export function analyse(records: PriceRecord[], at: { lat: number; lon: number }): MandiView | null {
  if (!records.length) return null
  const asOf = records.reduce((m, r) => (r.date > m ? r.date : m), '')

  const latest = new Map<string, PriceRecord>()
  for (const r of records) {
    const prev = latest.get(r.market)
    if (!prev || r.date > prev.date) latest.set(r.market, r)
  }
  const placed = [...latest.values()]
    .filter((r) => daysBetween(r.date, asOf) <= CURRENT_DAYS)
    .flatMap((r) => {
      const p = marketPoint(r)
      return p ? [{ r, km: roadKm(at, p) }] : []
    })
  if (!placed.length) return null
  const near = placed.filter((m) => m.km <= MAX_MARKET_KM)
  const chosen = (near.length ? near : [...placed].sort((a, b) => a.km - b.km).slice(0, 5)).slice()

  const markets: MarketPrice[] = chosen
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_MARKETS)
    .map(({ r, km }) => ({
      market: r.market,
      district: r.district,
      minPrice: Math.round(r.minPrice),
      maxPrice: Math.round(r.maxPrice),
      modalPrice: Math.round(r.modalPrice),
      distanceKm: km,
      arrivalDate: r.date,
    }))
    .sort((a, b) => b.modalPrice - a.modalPrice)

  // trend: the nearest market with enough days in the last month, else the one with the most days
  const since = addDays(asOf, -30)
  const series = (market: string) => {
    const byDate = new Map<string, number[]>()
    for (const r of records) {
      if (r.market !== market || r.date < since) continue
      byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.modalPrice])
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({ date, modalPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) }))
  }
  const byDistance = [...markets].sort((a, b) => a.distanceKm - b.distanceKm)
  const candidates = byDistance.map((m) => ({ market: m.market, points: series(m.market) }))
  const pick =
    candidates.find((c) => c.points.length >= 5) ??
    candidates.reduce((best, c) => (c.points.length > best.points.length ? c : best), candidates[0]!)

  return { asOf, markets, trend: pick.points, trendMarket: pick.market, changePct7d: changePct(pick.points, 7) }
}

/** Percent change of the last price against the last price at least `days` earlier. */
export function changePct(points: PricePoint[], days: number): number {
  const last = points.at(-1)
  if (!last) return 0
  const cutoff = addDays(last.date, -days)
  const base = [...points].reverse().find((p) => p.date <= cutoff) ?? points[0]!
  if (base === last || base.modalPrice <= 0) return 0
  return Math.round(((last.modalPrice - base.modalPrice) / base.modalPrice) * 1000) / 10
}

/** Least-squares slope in ₹/quintal per day over the last `days` days. */
export function slopePerDay(points: PricePoint[], days = 7): number {
  const last = points.at(-1)
  if (!last) return 0
  const recent = points.filter((p) => daysBetween(p.date, last.date) <= days)
  if (recent.length < 2) return 0
  const xs = recent.map((p) => daysBetween(recent[0]!.date, p.date))
  const ys = recent.map((p) => p.modalPrice)
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, y) => s + y, 0) / ys.length
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  if (den === 0) return 0
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0)
  return Math.round((num / den) * 10) / 10
}
