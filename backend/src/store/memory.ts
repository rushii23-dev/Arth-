import type { FarmerProfile } from '../schemas.js'
import type { Store } from './types.js'

export function memoryStore(): Store {
  const farmers = new Map<string, FarmerProfile>()
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
  }
}
