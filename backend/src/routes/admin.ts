import { Hono } from 'hono'
import type { AuthVars } from '../auth.js'
import { canonicalDistrict } from '../data/districts.js'
import { ApiError } from '../errors.js'
import { istDate, type Clock } from '../lib/time.js'
import type { FarmerRow, Store } from '../store/types.js'

/**
 * The founder dashboard. Only verified Google emails listed in ARTH_ADMIN_EMAILS get the data;
 * everyone else gets 403 and nothing about other farmers. GET /admin/access tells any signed-in
 * user whether they themselves are an admin, and nothing else.
 */

const DAY_MS = 86_400_000
const RECENT = 30
const INACTIVE = 60

export interface Count {
  key: string
  count: number
}

export interface AdminFarmer {
  name: string
  village: string
  district: string
  crops: string[]
  lang: string
  signedUpAt: string | null
  lastSeenAt: string | null
}

export interface AdminOverview {
  generatedAt: string
  today: string
  totals: { farmers: number; signupsToday: number; signups7d: number; activeToday: number; active7d: number; inactive7d: number }
  byDistrict: Count[]
  byCrop: Count[]
  byLang: Count[]
  recent: AdminFarmer[]
  inactive: AdminFarmer[]
}

function counts(values: string[]): Count[] {
  const m = new Map<string, number>()
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

const time = (iso: string | undefined | null) => (iso ? Date.parse(iso) : NaN)

/** When the farmer was last in the app: the daily Home check-in, else the last profile save. */
const lastActive = (f: FarmerRow) => f.lastSeenAt ?? f.updatedAt ?? f.createdAt ?? null

export function overview(rows: FarmerRow[], now: Date): AdminOverview {
  const today = istDate(now)
  const weekAgo = now.getTime() - 7 * DAY_MS
  const view = (f: FarmerRow): AdminFarmer => ({
    name: f.name,
    village: f.village,
    district: canonicalDistrict(f.district) ?? f.district,
    crops: f.crops ?? [],
    lang: f.lang,
    signedUpAt: f.createdAt ?? null,
    lastSeenAt: lastActive(f),
  })
  const signedUp = (f: FarmerRow) => time(f.createdAt)
  const seen = (f: FarmerRow) => time(lastActive(f))
  const inactive = rows.filter((f) => !(seen(f) >= weekAgo))
  return {
    generatedAt: now.toISOString(),
    today,
    totals: {
      farmers: rows.length,
      signupsToday: rows.filter((f) => f.createdAt && istDate(new Date(f.createdAt)) === today).length,
      signups7d: rows.filter((f) => signedUp(f) >= weekAgo).length,
      activeToday: rows.filter((f) => f.lastSeenAt && istDate(new Date(f.lastSeenAt)) === today).length,
      active7d: rows.length - inactive.length,
      inactive7d: inactive.length,
    },
    byDistrict: counts(rows.map((f) => canonicalDistrict(f.district) ?? f.district)),
    byCrop: counts(rows.flatMap((f) => [...new Set(f.crops ?? [])])),
    byLang: counts(rows.map((f) => f.lang)),
    recent: [...rows].sort((a, b) => (signedUp(b) || 0) - (signedUp(a) || 0)).slice(0, RECENT).map(view),
    inactive: inactive.sort((a, b) => (seen(a) || 0) - (seen(b) || 0)).slice(0, INACTIVE).map(view),
  }
}

export function adminRoutes(deps: { store: Store; adminEmails: string[]; clock: Clock }) {
  const r = new Hono<{ Variables: AuthVars }>()
  const allowed = new Set(deps.adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  const isAdmin = (email: string | null) => !!email && allowed.has(email)

  r.get('/access', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ admin: isAdmin(c.get('email')) })
  })

  r.get('/overview', async (c) => {
    c.header('Cache-Control', 'no-store')
    if (!isAdmin(c.get('email'))) throw new ApiError(403, 'forbidden', 'Not allowed')
    return c.json(overview(await deps.store.listFarmers(), deps.clock()))
  })

  return r
}
