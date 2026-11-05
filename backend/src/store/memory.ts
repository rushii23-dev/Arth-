import type { FarmerProfile } from '../schemas.js'
import type { SharedRecord } from '../services/schemes.js'
import type { Store } from './types.js'

export function memoryStore(): Store {
  const farmers = new Map<string, FarmerProfile>()
  const interest: SharedRecord[] = []
  return {
    async getFarmer(uid) {
      const p = farmers.get(uid)
      return p ? structuredClone(p) : null
    },
    async putFarmer(uid, profile) {
      farmers.set(uid, structuredClone(profile))
    },
    async deleteFarmer(uid) {
      farmers.delete(uid)
    },
    async addSchemeInterest(record) {
      interest.push(structuredClone(record))
    },
  }
}
