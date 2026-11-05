import { z } from 'zod'

// Mirrors frontend/src/lib/api/types.ts (SPEC §3). Change both or neither.

export const Lang = z.enum(['en', 'hi', 'mr'])
export const Season = z.enum(['kharif', 'rabi', 'zaid'])
export const SoilType = z.enum(['black', 'red', 'alluvial', 'laterite', 'sandy', 'clay'])
export const Irrigation = z.enum(['rainfed', 'drip', 'sprinkler', 'canal', 'borewell'])

/** SPEC §5.8: coordinates rounded to 2 decimals (~1 km). */
export const round2 = (n: number) => Math.round(n * 100) / 100
const coord = (min: number, max: number) => z.number().min(min).max(max).transform(round2)
const shortText = z.string().trim().max(80)
const tags = z.array(z.string().trim().min(1).max(40)).max(20)

export const FarmerProfileInput = z.object({
  name: shortText.min(1),
  lang: Lang,
  village: shortText,
  district: shortText.min(1),
  state: shortText.min(1),
  lat: coord(-90, 90),
  lon: coord(-180, 180),
  crops: tags,
  landAcres: z.number().min(0).max(10_000),
  soilType: SoilType.optional(),
  soilSource: z.enum(['auto', 'farmer']).optional(),
  irrigation: Irrigation,
  waterSources: z.array(Irrigation).max(5).optional(),
  tankSizeLitres: z.number().positive().max(1000),
  consentAt: z.iso.datetime({ offset: true }).nullable(),
  experienceYears: z.number().int().min(0).max(100).optional(),
  landOwnership: z.enum(['own', 'lease', 'both']).optional(),
  farmingType: z.enum(['conventional', 'organic', 'mixed']).optional(),
  goals: tags.optional(),
  sellsAt: tags.optional(),
  livestock: tags.optional(),
  onboardedVersion: z.number().int().min(0).optional(),
})
export type FarmerProfileInput = z.infer<typeof FarmerProfileInput>

export type FarmerProfile = Omit<FarmerProfileInput, 'soilType'> & {
  soilType: z.infer<typeof SoilType>
  createdAt: string
  updatedAt: string
}
