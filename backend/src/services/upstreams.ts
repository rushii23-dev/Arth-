/**
 * Can this server reach the outside data it depends on? `GET /health?upstreams` answers with each
 * source's HTTP status (or the network error code) and time taken, so a broken host or a blocked
 * region shows up without a farmer's login. No keys, URLs or bodies are returned. Cached for a
 * minute so the public health endpoint cannot be used to hammer the sources.
 */

export interface UpstreamCheck {
  ok: boolean
  /** HTTP status, or a network error code such as ETIMEDOUT / ENOTFOUND / UND_ERR_CONNECT_TIMEOUT */
  result: string
  ms: number
}

const TIMEOUT_MS = 15_000
const CACHE_MS = 60_000

async function check(url: string, fetchFn: typeof fetch): Promise<UpstreamCheck> {
  const start = Date.now()
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    await res.body?.cancel().catch(() => {})
    return { ok: res.ok, result: String(res.status), ms: Date.now() - start }
  } catch (err) {
    return { ok: false, result: errorCode(err), ms: Date.now() - start }
  }
}

/** The most specific code in a fetch error chain ("fetch failed" hides the real one in `cause`). */
export function errorCode(err: unknown): string {
  for (let e = err as { name?: string; code?: string; cause?: unknown } | undefined, depth = 0; e && depth < 4; e = e.cause as typeof e, depth++) {
    if (e.code) return String(e.code)
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'TIMEOUT'
  }
  return err instanceof Error ? err.name : 'ERROR'
}

export function upstreamProbe(dataGovInApiKey: string, fetchFn: typeof fetch = fetch, now = Date.now) {
  let last: { at: number; value: Promise<Record<string, UpstreamCheck>> } | null = null
  return () => {
    if (last && now() - last.at < CACHE_MS) return last.value
    const mandi = new URLSearchParams({ 'api-key': dataGovInApiKey, format: 'json', limit: '1', 'filters[state.keyword]': 'Maharashtra' })
    const value = Promise.all([
      check('https://api.open-meteo.com/v1/forecast?latitude=20&longitude=74&current=temperature_2m', fetchFn),
      check(`https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${mandi}`, fetchFn),
    ]).then(([weather, mandiPrices]) => ({ weather, mandiPrices }))
    last = { at: now(), value }
    return value
  }
}
