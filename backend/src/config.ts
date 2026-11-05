export type StoreKind = 'memory' | 'firestore'

export interface Config {
  env: 'development' | 'production' | 'test'
  port: number
  firebaseProjectId: string
  corsOrigins: string[]
  store: StoreKind
  geminiApiKey: string
  model: string
  dataGovInApiKey: string
  /** Rough truck cost used in sell advice, ₹ per quintal per km. */
  transportRsPerQuintalKm: number
}

export function loadConfig(e: NodeJS.ProcessEnv = process.env): Config {
  const env = (e.ARTH_ENV ?? 'development') as Config['env']
  const store = (e.ARTH_STORE ?? (env === 'production' ? 'firestore' : 'memory')) as StoreKind
  const cfg: Config = {
    env,
    port: Number(e.PORT ?? 8000),
    firebaseProjectId: e.ARTH_FIREBASE_PROJECT_ID ?? '',
    corsOrigins: parseList(e.ARTH_CORS_ORIGINS ?? 'http://localhost:5173'),
    store,
    geminiApiKey: e.GEMINI_API_KEY ?? '',
    model: e.ARTH_MODEL ?? '',
    dataGovInApiKey: e.ARTH_DATA_GOV_IN_API_KEY ?? '',
    transportRsPerQuintalKm: Number(e.ARTH_TRANSPORT_RS_PER_QUINTAL_KM ?? 2),
  }
  if (!cfg.firebaseProjectId && env !== 'test') throw new Error('ARTH_FIREBASE_PROJECT_ID is required')
  if (store !== 'memory' && store !== 'firestore') throw new Error(`ARTH_STORE must be memory or firestore, got ${store}`)
  if (env === 'production' && store === 'memory') throw new Error('ARTH_STORE=memory is not allowed in production')
  return cfg
}

/** Accepts "a,b" or the older JSON-list form '["a","b"]'. */
function parseList(v: string): string[] {
  const s = v.trim()
  if (s.startsWith('[')) return (JSON.parse(s) as string[]).map((x) => x.trim()).filter(Boolean)
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
