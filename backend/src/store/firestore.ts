import { getFirestore } from 'firebase-admin/firestore'
import type { FarmerProfile } from '../schemas.js'
import type { NewsDoc } from '../services/news.js'
import type { FarmerRow, MandiSnapshot, Store } from './types.js'

/** The profile fields the founder dashboard reads; nothing else leaves Firestore for it. */
const ROW_FIELDS = ['name', 'village', 'district', 'crops', 'lang', 'createdAt', 'updatedAt', 'lastSeenAt'] as const

/**
 * farmers/{uid} holds the profile; farmers/{uid}/history/* the 30-day redacted history;
 * mandiSnapshots/{commodity} the last public mandi prices fetched (no user data);
 * districtNews/{district}_{YYYY-MM-DD} one day's official farm news for a district (no user data).
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
    async touchFarmer(uid, at) {
      // update(), not set(): only this one field changes, and a deleted profile is not brought back
      await farmer(uid).update({ lastSeenAt: at })
    },
    async listFarmers() {
      const snap = await db.collection('farmers').select(...ROW_FIELDS).get()
      return snap.docs.map((d) => d.data() as FarmerRow)
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
    async getDistrictNews(id) {
      const snap = await db.collection('districtNews').doc(id).get()
      return snap.exists ? (snap.data() as NewsDoc) : null
    },
    async putDistrictNews(id, doc) {
      await db.collection('districtNews').doc(id).set(doc)
    },
  }
}
