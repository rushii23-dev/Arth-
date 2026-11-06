import i18n from 'i18next'

/**
 * Every crop Arth knows by id. Mirrors backend/src/data/crops.ts: change both or neither.
 *
 * Core crops are the onboarding tiles and have full support (crop calendar, weather jobs,
 * the crop doctor's checked advice). The rest come from "Other crops" and get mandi prices,
 * sell advice and schemes. A farmer can also type in a crop that is in neither list: it is
 * kept on the profile as plain text, shown by name, and never priced.
 */

export const CORE_CROPS = ['onion', 'soybean', 'tomato', 'grapes', 'cotton', 'wheat', 'gram', 'sugarcane', 'pomegranate', 'maize'] as const

/** "Other crops", grouped the way the picker shows them. */
export const MORE_CROP_GROUPS = {
  grains: ['jowar', 'bajra', 'paddy', 'ragi', 'tur', 'moong', 'urad', 'peas'],
  oilseeds: ['groundnut', 'sunflower', 'safflower', 'sesame'],
  fruit: ['banana', 'orange', 'mosambi', 'mango', 'papaya', 'guava', 'custard_apple', 'lemon', 'watermelon'],
  vegetables: ['chilli', 'capsicum', 'brinjal', 'okra', 'cabbage', 'cauliflower', 'potato', 'carrot', 'cucumber', 'bottle_gourd', 'bitter_gourd', 'drumstick', 'coriander', 'methi'],
  spices: ['garlic', 'ginger', 'turmeric'],
} as const

export type CropGroup = keyof typeof MORE_CROP_GROUPS
export type CoreCrop = (typeof CORE_CROPS)[number]
export type MoreCrop = (typeof MORE_CROP_GROUPS)[CropGroup][number]
export type CropId = CoreCrop | MoreCrop

export const MORE_CROPS: MoreCrop[] = Object.values(MORE_CROP_GROUPS).flat()
export const ALL_CROPS: CropId[] = [...CORE_CROPS, ...MORE_CROPS]

const ALL = new Set<string>(ALL_CROPS)
const CORE = new Set<string>(CORE_CROPS)

export const isKnownCrop = (c: string | null | undefined): c is CropId => !!c && ALL.has(c)
export const isCoreCrop = (c: string | null | undefined): c is CoreCrop => !!c && CORE.has(c)

/** Longest crop name a farmer can type in (the profile allows 40). */
export const MAX_CROP_TEXT = 30

const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

/** Every name a crop goes by, in all three languages, folded for matching. */
function namesOf(id: CropId): string[] {
  return (['en', 'hi', 'mr'] as const).flatMap((lng) => {
    const name = i18n.getFixedT(lng, 'common')(`crops.${id}`)
    // "Tur (arhar)" also answers to "tur" and "arhar"
    const bits = name.split(/[()]/).map((b) => fold(b)).filter(Boolean)
    return [fold(name), ...bits]
  })
}

/** Crops whose name in any language contains the search text. */
export function searchCrops(query: string, among: readonly CropId[] = MORE_CROPS): CropId[] {
  const q = fold(query)
  if (!q) return [...among]
  return among.filter((id) => fold(id.replace(/_/g, ' ')).includes(q) || namesOf(id).some((n) => n.includes(q)))
}

/**
 * What a typed-in crop is saved as: a catalog id when the text is one of its names in any
 * language ("tur", "तूर", "Arhar"), otherwise the cleaned-up text itself, or null when
 * nothing usable is left.
 */
export function cropFromText(text: string): string | null {
  const q = fold(text)
  if (!q) return null
  const exact = ALL_CROPS.find((id) => fold(id.replace(/_/g, ' ')) === q || namesOf(id).includes(q))
  if (exact) return exact
  // letters of any script, digits, spaces and a little punctuation; no "." or ":" (i18n key separators)
  const clean = text
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N} ()'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CROP_TEXT)
    .trim()
  return clean || null
}
