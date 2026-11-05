import { getFirestore } from 'firebase-admin/firestore'
import type { FarmerProfile } from '../schemas.js'
import type { Store } from './types.js'

/** farmers/{uid} holds the profile; farmers/{uid}/history/* the 30-day redacted history. */
export function firestoreStore(): Store {
  const db = getFirestore()
  db.settings({ ignoreUndefinedProperties: true })
  const farmer = (uid: string) => db.collection('farmers').doc(uid)
  return {
    async getFarmer(uid) {
      const snap = await farmer(uid).get()
      return snap.exists ? (snap.data() as FarmerProfile) : null
    },
    async putFarmer(uid, profile) {
      await farmer(uid).set(profile)
    },
    async deleteFarmer(uid) {
      await db.recursiveDelete(farmer(uid))
    },
  }
}
