import type { FarmerProfile } from '../schemas.js'

/** Everything the backend keeps. Firestore in the cloud, memory for local dev and tests. */
export interface Store {
  getFarmer(uid: string): Promise<FarmerProfile | null>
  putFarmer(uid: string, profile: FarmerProfile): Promise<void>
  /** SPEC §5.7: the profile and all history for the UID. */
  deleteFarmer(uid: string): Promise<void>
}
