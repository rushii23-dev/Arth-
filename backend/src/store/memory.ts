import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FarmerProfile } from '../schemas.js'
import type { NewsDoc } from '../services/news.js'
import type { SharedRecord } from '../services/schemes.js'
import type { FarmerRow, MandiSnapshot, Store } from './types.js'

/**
 * Everything in memory. With `snapshotDir`, mandi snapshots (public prices, no user data) are also
 * written there, so local restarts still have prices while the upstream API is down.
 */
export function memoryStore(opts: { snapshotDir?: string } = {}): Store {
  const farmers = new Map<string, FarmerProfile>()
  const interest: SharedRecord[] = []
  const snapshots = new Map<string, MandiSnapshot>()
  const news = new Map<string, NewsDoc>()
  const file = (commodity: string) =>
    opts.snapshotDir && /^[a-z0-9_-]+$/.test(commodity) ? join(opts.snapshotDir, `mandi-${commodity}.json`) : null
  return {
    async getFarmer(uid) {
      const p = farmers.get(uid)
      return p ? structuredClone(p) : null
    },
    async putFarmer(uid, profile) {
      farmers.set(uid, structuredClone(profile))
    },
    async touchFarmer(uid, at) {
      const p = farmers.get(uid)
      if (p) p.lastSeenAt = at
    },
    async listFarmers() {
      return [...farmers.values()].map(
        (p): FarmerRow => ({
          name: p.name,
          village: p.village,
          district: p.district,
          crops: [...p.crops],
          lang: p.lang,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          lastSeenAt: p.lastSeenAt,
        }),
      )
    },
    async deleteFarmer(uid) {
      farmers.delete(uid)
    },
    async addSchemeInterest(record) {
      interest.push(structuredClone(record))
    },
    async getMandiSnapshot(commodity) {
      const hit = snapshots.get(commodity)
      if (hit) return structuredClone(hit)
      const f = file(commodity)
      if (!f) return null
      try {
        return JSON.parse(await readFile(f, 'utf8')) as MandiSnapshot
      } catch {
        return null
      }
    },
    async putMandiSnapshot(commodity, snapshot) {
      snapshots.set(commodity, structuredClone(snapshot))
      const f = file(commodity)
      if (!f) return
      await mkdir(opts.snapshotDir!, { recursive: true })
      await writeFile(f, JSON.stringify(snapshot))
    },
    async getDistrictNews(id) {
      const hit = news.get(id)
      return hit ? structuredClone(hit) : null
    },
    async putDistrictNews(id, doc) {
      news.set(id, structuredClone(doc))
    },
  }
}
