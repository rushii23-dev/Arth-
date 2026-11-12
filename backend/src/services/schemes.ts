import { randomUUID } from 'node:crypto'
import { isCrop } from '../data/crops.js'
import { canonicalDistrict } from '../data/districts.js'
import { tx } from '../lib/texts.js'
import type { LangCode } from '../lib/time.js'

export interface SchemeAnswers {
  ownsLand: boolean
  landAcres: number
  category: 'general' | 'obc' | 'sc' | 'st'
  hasBankAccount: boolean
  hasAadhaar: boolean
  isWoman: boolean
  irrigation: 'rainfed' | 'drip' | 'sprinkler' | 'canal' | 'borewell'
  incomeTaxPayer: boolean
}

export interface SchemeResult {
  id: string
  name: string
  eligible: boolean
  reasons: string[]
  benefit: string
  documents: string[]
  officialUrl: string
}

interface Rule {
  id: string
  url: string
  docs: string[]
  /** returns eligibility and the reason keys (with vars) to show */
  check: (a: SchemeAnswers) => { eligible: boolean; why: [string, Record<string, string>?][] }
}

/** Small and marginal farmers: up to 2 hectares, about 5 acres. */
const SMALL_FARM_ACRES = 5

/** "You will need …" lines for documents the farmer does not have yet. */
const needs = (a: SchemeAnswers): [string][] => [
  ...(a.hasAadhaar ? [] : [['scheme.why.needAadhaar'] as [string]]),
  ...(a.hasBankAccount ? [] : [['scheme.why.needBank'] as [string]]),
]

const landOwner = (a: SchemeAnswers) => (a.ownsLand ? 'scheme.why.ownsLand' : 'scheme.why.noLand')

/** Central and Maharashtra schemes, eligible-first order is applied when matching. */
const RULES: Rule[] = [
  {
    id: 'pm-kisan',
    url: 'https://pmkisan.gov.in',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({
      eligible: a.ownsLand && !a.incomeTaxPayer,
      why: [[landOwner(a)], ...(a.incomeTaxPayer ? [['scheme.why.taxPayer'] as [string]] : []), ...needs(a)],
    }),
  },
  {
    id: 'namo-shetkari',
    url: 'https://nsmny.mahait.org',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({
      eligible: a.ownsLand && !a.incomeTaxPayer,
      why: [['scheme.why.pmKisanFirst'], ...(a.incomeTaxPayer ? [['scheme.why.taxPayer'] as [string]] : []), ...needs(a)],
    }),
  },
  {
    id: 'pmfby',
    url: 'https://pmfby.gov.in',
    docs: ['aadhaar', 'bank', 'land', 'sowing'],
    check: (a) => ({ eligible: true, why: [['scheme.why.allFarmers'], ...needs(a)] }),
  },
  {
    id: 'kcc',
    url: 'https://pmkisan.gov.in',
    docs: ['aadhaar', 'land', 'photo'],
    check: (a) => ({ eligible: true, why: [['scheme.why.allFarmers'], ...needs(a)] }),
  },
  {
    id: 'soil-health-card',
    url: 'https://soilhealth.dac.gov.in',
    docs: ['aadhaar', 'land'],
    check: () => ({ eligible: true, why: [['scheme.why.allFarmersFree']] }),
  },
  {
    id: 'pmksy',
    url: 'https://pmksy.gov.in',
    docs: ['aadhaar', 'bank', 'land', 'quotation'],
    check: (a) => ({
      eligible: a.ownsLand,
      why: [
        [landOwner(a)],
        a.irrigation === 'drip' || a.irrigation === 'sprinkler'
          ? ['scheme.why.hasDrip']
          : ['scheme.why.saveWater', { irrigation: `irrigation.${a.irrigation}` }],
        ...(a.ownsLand && a.landAcres <= SMALL_FARM_ACRES ? [['scheme.why.smallFarm'] as [string]] : []),
        ...needs(a),
      ],
    }),
  },
  {
    id: 'mahadbt-farm-mech',
    url: 'https://mahadbt.maharashtra.gov.in',
    docs: ['aadhaar', 'bank', 'land', 'quotation'],
    check: (a) => {
      const group = a.category === 'sc' ? 'sc' : a.category === 'st' ? 'st' : a.isWoman ? 'woman' : null
      return {
        eligible: a.ownsLand,
        why: [
          [landOwner(a)],
          ...(a.ownsLand && group ? [['scheme.why.priority', { group: `scheme.why.group.${group}` }] as [string, Record<string, string>]] : []),
          ...(a.ownsLand && !group && a.landAcres <= SMALL_FARM_ACRES ? [['scheme.why.smallFarm'] as [string]] : []),
          ...needs(a),
        ],
      }
    },
  },
  ...(['sc', 'st'] as const).map(
    (cat): Rule => ({
      id: cat === 'sc' ? 'ambedkar' : 'birsa-munda',
      url: 'https://mahadbt.maharashtra.gov.in',
      docs: ['aadhaar', 'bank', 'land', 'caste', 'income'],
      check: (a) => {
        const inCategory = a.category === cat
        // the schemes cover holdings from 0.40 to 6.00 hectares
        const landFits = a.ownsLand && a.landAcres >= 1 && a.landAcres <= 15
        return {
          eligible: inCategory && landFits,
          why: [
            ...(inCategory ? [] : [[cat === 'sc' ? 'scheme.why.onlySc' : 'scheme.why.onlySt'] as [string]]),
            ...(inCategory ? [[landFits ? 'scheme.why.landFits' : a.ownsLand ? 'scheme.why.landRange' : 'scheme.why.noLand'] as [string]] : []),
            ...(inCategory ? needs(a) : []),
          ],
        }
      },
    }),
  ),
  {
    // Magel Tyala Saur Krushi Pump (MSEDCL): pump size by land, up to 2.5 / 5 / above 5 acres
    id: 'saur-pump',
    url: 'https://www.mahadiscom.in/solar_MTSKPY/',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({
      eligible: a.ownsLand,
      why: [
        [landOwner(a)],
        ...(a.ownsLand
          ? [
              ['scheme.why.pumpSize', { hp: a.landAcres <= 2.5 ? '3' : a.landAcres <= 5 ? '5' : '7.5' }] as [string, Record<string, string>],
              ['scheme.why.waterSource'] as [string],
            ]
          : []),
        ...(a.ownsLand && (a.category === 'sc' || a.category === 'st') ? [['scheme.why.lowerShare'] as [string]] : []),
        ...needs(a),
      ],
    }),
  },
  {
    // Mukhyamantri Shashwat Krishi Sinchan Yojana: farm ponds on demand; about 0.40 ha minimum (less in Konkan)
    id: 'shettale',
    url: 'https://mahadbt.maharashtra.gov.in',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => {
      const landFits = a.ownsLand && a.landAcres >= 1
      return {
        eligible: landFits,
        why: [
          [a.ownsLand ? (landFits ? 'scheme.why.pondLandFits' : 'scheme.why.pondLand') : 'scheme.why.noLand'],
          ...(a.irrigation === 'rainfed' ? [['scheme.why.storesRain'] as [string]] : []),
          ...needs(a),
        ],
      }
    },
  },
  {
    id: 'fundkar-phalbag',
    url: 'https://mahadbt.maharashtra.gov.in',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({ eligible: a.ownsLand, why: [[landOwner(a)], ['scheme.why.newOrchard'], ...needs(a)] }),
  },
  {
    id: 'midh',
    url: 'https://midh.gov.in',
    docs: ['aadhaar', 'bank', 'land', 'quotation'],
    check: (a) => ({ eligible: a.ownsLand, why: [[landOwner(a)], ['scheme.why.horticulture'], ...needs(a)] }),
  },
  {
    // PM Kisan Maandhan: pension for small and marginal farmers who join at 18 to 40
    id: 'pm-kmy',
    url: 'https://maandhan.in',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({
      eligible: a.ownsLand && a.landAcres <= SMALL_FARM_ACRES && !a.incomeTaxPayer,
      why: [
        [a.ownsLand ? 'scheme.why.smallFarmOnly' : 'scheme.why.noLand'],
        ['scheme.why.ageMaandhan'],
        ...(a.incomeTaxPayer ? [['scheme.why.taxPayer'] as [string]] : []),
        ...needs(a),
      ],
    }),
  },
  {
    // Gopinath Munde Shetkari Apghat Suraksha Sanugrah Anudan: accident grant, no premium
    id: 'gopinath-munde',
    url: 'https://krishi.maharashtra.gov.in',
    docs: ['aadhaar', 'bank', 'land'],
    check: (a) => ({ eligible: a.ownsLand, why: [[a.ownsLand ? 'scheme.why.accidentCover' : 'scheme.why.accidentNoLand']] }),
  },
  {
    // Restructured Weather Based Crop Insurance: Maharashtra's fruit crop insurance, on the PMFBY portal
    id: 'rwbcis',
    url: 'https://pmfby.gov.in',
    docs: ['aadhaar', 'bank', 'land', 'sowing'],
    check: (a) => ({ eligible: true, why: [['scheme.why.fruitGrowers'], ...needs(a)] }),
  },
]

export const SCHEME_IDS = RULES.map((r) => r.id)

export function matchSchemes(a: SchemeAnswers, lang: LangCode): SchemeResult[] {
  const results = RULES.map((r) => {
    const { eligible, why } = r.check(a)
    return {
      id: r.id,
      name: tx(lang, `scheme.${r.id}.name`),
      eligible,
      // a var that names another text key (like the irrigation word) is translated too
      reasons: why.map(([key, vars]) =>
        tx(lang, key, Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [k, tx(lang, v)]))),
      ),
      benefit: tx(lang, `scheme.${r.id}.benefit`),
      documents: r.docs.map((d) => tx(lang, `scheme.doc.${d}`)),
      officialUrl: r.url,
    }
  })
  // eligible first, in the order above
  return [...results.filter((s) => s.eligible), ...results.filter((s) => !s.eligible)]
}

// ---- Anonymous share of scheme interest --------------------------------------------------

export interface SharedRecord {
  recordId: string
  schemeId: string
  district: string | null
  crop: string | null
  landBand: '0-1' | '1-2' | '2-5' | '5-10' | '10+' | null
  lang: LangCode
  day: string
}

export function landBand(acres: number | undefined): SharedRecord['landBand'] {
  if (acres === undefined || !Number.isFinite(acres) || acres < 0) return null
  if (acres < 1) return '0-1'
  if (acres < 2) return '1-2'
  if (acres < 5) return '2-5'
  if (acres < 10) return '5-10'
  return '10+'
}

/** Only fixed-list values leave the device: a district and crop from our lists, land as a band. No user id. */
export function sharedRecord(
  req: { schemeId: string; district?: string; crop?: string; landAcres?: number; lang: LangCode },
  day: string,
): SharedRecord {
  return {
    recordId: randomUUID(),
    schemeId: req.schemeId,
    district: req.district ? (canonicalDistrict(req.district) ?? null) : null,
    crop: isCrop(req.crop) ? req.crop : null,
    landBand: landBand(req.landAcres),
    lang: req.lang,
    day,
  }
}
