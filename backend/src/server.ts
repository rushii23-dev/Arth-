import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { createApp } from './app.js'
import { firebaseVerifier } from './auth.js'
import { loadConfig } from './config.js'
import { gemini } from './services/llm.js'
import { geminiSearch, resolveGroundingLink } from './services/news.js'
import { cachedMandi, dataGovIn } from './services/mandi.js'
import { cached, openMeteo } from './services/weather.js'
import { firestoreStore } from './store/firestore.js'
import { memoryStore } from './store/memory.js'

/**
 * The real API with its real dependencies, shared by the long-running Node server (src/index.ts:
 * Cloud Run, Render, local) and the serverless entry (api/index.ts: Vercel).
 */
export function buildServer() {
  const config = loadConfig()
  // On Cloud Run the service account supplies credentials; locally, token checks need only the project ID.
  // Off Google Cloud (Vercel, Render), Firestore needs a service account key, passed whole
  // (JSON, or the same JSON base64-encoded) in ARTH_FIREBASE_SERVICE_ACCOUNT. It is never logged.
  if (!getApps().length) {
    initializeApp({ projectId: config.firebaseProjectId, ...serviceAccountCredential(process.env.ARTH_FIREBASE_SERVICE_ACCOUNT) })
  }

  const store = config.store === 'firestore' ? firestoreStore() : memoryStore({ snapshotDir: '.data' })
  const warn = (msg: string, extra: Record<string, unknown>) =>
    console.log(JSON.stringify({ severity: 'WARNING', msg, ...extra }))
  const app = createApp({
    config,
    store,
    verifyToken: firebaseVerifier(config.firebaseProjectId),
    forecast: cached(openMeteo()),
    mandi: cachedMandi(dataGovIn(config.dataGovInApiKey), undefined, undefined, store, warn),
    llm: gemini(config.geminiApiKey),
    newsSearch: geminiSearch(config.geminiApiKey),
    resolveLink: resolveGroundingLink(),
  })
  return { app, config }
}

function serviceAccountCredential(raw: string | undefined) {
  const text = raw?.trim()
  if (!text) return {}
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8')
  try {
    return { credential: cert(JSON.parse(json) as ServiceAccount) }
  } catch {
    throw new Error('ARTH_FIREBASE_SERVICE_ACCOUNT is not a valid service account key (JSON or base64 JSON)')
  }
}
