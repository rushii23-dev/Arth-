import { getFirestore } from 'firebase-admin/firestore'
import type { FarmerProfile } from '../schemas.js'
import type { MandiSnapshot, Store } from './types.js'

/**
 * farmers/{uid} holds the profile; farmers/{uid}/history/* the 30-day redacted history;
 * mandiSnapshots/{commodity} the last public mandi prices fetched (no user data).
 */
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
    async addSchemeInterest(record) {
      await db.collection('schemeInterest').doc(record.recordId).set(record)
    },
    async getMandiSnapshot(commodity) {
      const snap = await db.collection('mandiSnapshots').doc(commodity).get()
      return snap.exists ? (snap.data() as MandiSnapshot) : null
    },
    async putMandiSnapshot(commodity, snapshot) {
      await db.collection('mandiSnapshots').doc(commodity).set(snapshot)
    },
  }
}
