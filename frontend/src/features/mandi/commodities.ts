import { ALL_CROPS, CORE_CROPS, isKnownCrop, type CropId } from '@/lib/crops'

/**
 * Crops the mandi service has live prices for: every crop in the catalog, core and
 * "Other crops" (backend data/crops.ts gives each its Agmarknet name). A crop the
 * farmer typed in by hand has no prices.
 */
export const MANDI_COMMODITIES = ALL_CROPS
export type MandiCommodity = CropId

export const isMandiCommodity = (c: string | null | undefined): c is MandiCommodity => isKnownCrop(c)

/**
 * Only the farmer's own crops, in profile order: prices for crops they don't grow
 * are noise. A profile with none of them still gets the core crops.
 */
export function farmerCommodities(crops: readonly string[]): MandiCommodity[] {
  const own = [...new Set(crops.filter(isMandiCommodity))]
  return own.length ? own : [...CORE_CROPS]
}

/** First profile crop that has price data, else onion (Nashik's main crop). */
export function defaultCommodity(crops: readonly string[]): MandiCommodity {
  return crops.find(isMandiCommodity) ?? 'onion'
}

/** Quantity typed by the farmer → quintals, or null when not usable. */
export const MAX_QUINTALS = 10_000
export function parseQuintals(raw: string): number | null {
  const n = Number(raw.trim())
  if (!raw.trim() || !Number.isFinite(n) || n <= 0 || n > MAX_QUINTALS) return null
  return Math.round(n * 10) / 10
}
