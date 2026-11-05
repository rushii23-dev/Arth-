import { canonicalDistrict, DISTRICTS } from '../data/districts.js'
import { DISTRICT_SOIL, SOIL_HEALTH_SOURCE } from '../data/soils.js'
import { tx } from '../lib/texts.js'
import type { LangCode } from '../lib/time.js'

/**
 * The district a point is in: the nearest district centre, if the point is plausibly inside
 * Maharashtra. Same rule as the frontend's onboarding (frontend/src/features/onboarding/model.ts).
 */
export function districtAt(lat: number, lon: number): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const [name, c] of Object.entries(DISTRICTS)) {
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  // ~1° is ~110 km: farther than that from every district centre is outside the state
  return bestD <= 1 ? best : undefined
}

export const soilOf = (district: string) => DISTRICT_SOIL[canonicalDistrict(district) ?? ''] ?? 'black'

/**
 * SPEC SoilReport. Only the soil type is known per district; Soil Health Card test shares are not
 * bundled, so they are null and samples is 0 (the app then says "no tests on record" and shows tips).
 * Nothing here is invented.
 */
export function soilReport(district: string, lang: LangCode) {
  const name = canonicalDistrict(district) ?? district
  const soilType = soilOf(name)
  const districtLocal = lang === 'en' ? name : (DISTRICTS[name]?.dev ?? name)
  return {
    district: name,
    districtLocal,
    soilType,
    basis: 'district' as const,
    cycle: null,
    samples: 0,
    nitrogen: null,
    phosphorus: null,
    potassium: null,
    organicCarbon: null,
    deficient: {},
    tips: [1, 2, 3].map((n) => tx(lang, `soil.tip.${soilType}.${n}`)).concat(tx(lang, 'soil.tip.odds', { district: districtLocal })),
    source: SOIL_HEALTH_SOURCE,
  }
}
