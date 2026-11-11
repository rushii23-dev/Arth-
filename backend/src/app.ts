import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { requireAuth, type AuthVars, type TokenVerifier } from './auth.js'
import type { Config } from './config.js'
import { ApiError, errorBody } from './errors.js'
import type { Clock } from './lib/time.js'
import { farmerRoutes } from './routes/farmer.js'
import { adminRoutes } from './routes/admin.js'
import { aiRoutes } from './routes/ai.js'
import { mandiRoutes } from './routes/mandi.js'
import { newsRoutes } from './routes/news.js'
import { planRoutes } from './routes/plan.js'
import { weatherRoutes } from './routes/weather.js'
import type { Llm } from './services/llm.js'
import { newsService, type GroundedSearch, type ResolveLink } from './services/news.js'
import { upstreamProbe } from './services/upstreams.js'
import type { MandiSource } from './services/mandi.js'
import type { ForecastSource } from './services/weather.js'
import type { Store } from './store/types.js'

export interface Deps {
  config: Config
  store: Store
  verifyToken: TokenVerifier
  forecast: ForecastSource
  mandi: MandiSource
  llm: Llm
  /** per-user limit for /ai/*; tests pass a no-op */
  aiLimit?: (uid: string) => void
  clock?: Clock
  /** Gemini with Google Search grounding, for the district news; without it the news is always empty */
  newsSearch?: GroundedSearch
  /** turns a grounding redirect link into the real page address */
  resolveLink?: ResolveLink
}

const noSearch: GroundedSearch = async () => {
  throw new ApiError(503, 'ai_not_configured', 'AI is not set up on this server')
}

export function createApp({ config, store, verifyToken, forecast, mandi, llm, aiLimit, clock = () => new Date(), newsSearch, resolveLink }: Deps) {
  const api = new Hono<{ Variables: AuthVars }>()
  const news = newsService({
    search: newsSearch ?? noSearch,
    resolve: resolveLink ?? (async (u) => u),
    model: config.newsModel,
    store,
    clock,
    warn: (msg, extra) => console.log(JSON.stringify({ severity: 'WARNING', msg, ...extra })),
  })

  const probe = upstreamProbe(config.dataGovInApiKey)
  api.get('/health', async (c) => {
    const health = { ok: true, model: config.model, modelReady: Boolean(config.geminiApiKey), cloudSync: true }
    // ?upstreams: can this host reach the weather and mandi sources (status codes only)
    if (c.req.query('upstreams') === undefined) return c.json(health)
    return c.json({ ...health, upstreams: await probe() })
  })

  api.use('*', requireAuth(verifyToken))
  api.route('/farmer', farmerRoutes(store, clock))
  api.route('/', weatherRoutes({ store, forecast, mandi, clock }))
  api.route('/', planRoutes({ store, forecast, mandi, clock }))
  api.route('/mandi', mandiRoutes({ mandi, rsPerQuintalKm: config.transportRsPerQuintalKm }))
  api.route('/ai', aiRoutes({ llm, models: { vision: config.model, audio: config.audioModel }, limit: aiLimit }))
  api.route('/', newsRoutes({ store, news, clock }))
  api.route('/admin', adminRoutes({ store, adminEmails: config.adminEmails, clock }))

  const app = new Hono()
  app.use('*', secureHeaders({ xFrameOptions: 'DENY', referrerPolicy: 'strict-origin-when-cross-origin' }))
  app.use('*', cors({ origin: config.corsOrigins, allowHeaders: ['Authorization', 'Content-Type'], maxAge: 600 }))
  // SPEC §3: images ≤ 5 MB, audio ≤ 15 s; 6 MB leaves room for the multipart envelope.
  app.use('*', bodyLimit({ maxSize: 6 * 1024 * 1024, onError: (c) => errorBody(c, 413, 'too_large', 'Upload is over 5 MB') }))
  app.use('*', logRequest)

  // The Vite dev proxy forwards /api/*; Cloud Run is called on the bare paths.
  app.route('/api', api)
  app.route('/', api)

  app.notFound((c) => errorBody(c, 404, 'not_found', 'No such endpoint'))
  app.onError((err, c) => {
    if (err instanceof ApiError) return errorBody(c, err.status, err.code, err.message)
    if (err instanceof HTTPException) return errorBody(c, err.status as 400, 'http_' + err.status, err.message)
    console.error(JSON.stringify({ severity: 'ERROR', msg: 'unhandled', path: c.req.path, error: String(err) }))
    return errorBody(c, 500, 'internal', 'Something went wrong')
  })
  return app
}

/** SPEC §5.9: logs never contain bodies, tokens or PII — method, path, status and time only. */
const logRequest: Parameters<Hono['use']>[1] = async (c, next) => {
  const start = performance.now()
  await next()
  const ms = Math.round(performance.now() - start)
  console.log(JSON.stringify({ severity: 'INFO', method: c.req.method, path: c.req.path, status: c.res.status, ms }))
}
