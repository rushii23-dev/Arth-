import type { FarmerProfile } from '../schemas.js'
import type { SharedRecord } from '../services/schemes.js'

/** Everything the backend keeps. Firestore in the cloud, memory for local dev and tests. */
export interface Store {
  getFarmer(uid: string): Promise<FarmerProfile | null>
  putFarmer(uid: string, profile: FarmerProfile): Promise<void>
  /** SPEC §5.7: the profile and all history for the UID. */
  deleteFarmer(uid: string): Promise<void>
  /** Anonymous, opt-in interest in a scheme: no user id, only fixed-list fields. */
  addSchemeInterest(record: SharedRecord): Promise<void>
}
