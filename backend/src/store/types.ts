import type { FarmerProfile } from '../schemas.js'
import type { PriceRecord } from '../services/mandi.js'
import type { NewsDoc } from '../services/news.js'
import type { SharedRecord } from '../services/schemes.js'

/** The last mandi prices fetched for a commodity, kept so an upstream outage still shows prices. */
export interface MandiSnapshot {
  savedAt: string // ISO time
  records: PriceRecord[]
}

/** A farmer as the founder dashboard sees it: the profile, never the UID. */
export type FarmerRow = Pick<FarmerProfile, 'name' | 'village' | 'district' | 'crops' | 'lang' | 'createdAt' | 'updatedAt' | 'lastSeenAt'>

/** Everything the backend keeps. Firestore in the cloud, memory for local dev and tests. */
export interface Store {
  getFarmer(uid: string): Promise<FarmerProfile | null>
  putFarmer(uid: string, profile: FarmerProfile): Promise<void>
  /** Records when the farmer last opened the app (only this field changes). */
  touchFarmer(uid: string, at: string): Promise<void>
  /** Every farmer, for the founder dashboard only. */
  listFarmers(): Promise<FarmerRow[]>
  /** SPEC §5.7: the profile and all history for the UID. */
  deleteFarmer(uid: string): Promise<void>
  /** Anonymous, opt-in interest in a scheme: no user id, only fixed-list fields. */
  addSchemeInterest(record: SharedRecord): Promise<void>
  getMandiSnapshot(commodity: string): Promise<MandiSnapshot | null>
  putMandiSnapshot(commodity: string, snapshot: MandiSnapshot): Promise<void>
  /** One district's official farm news for one day (public, no user data). */
  getDistrictNews(id: string): Promise<NewsDoc | null>
  putDistrictNews(id: string, doc: NewsDoc): Promise<void>
}
