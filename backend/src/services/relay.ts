import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { errorBody } from '../errors.js'
import { errorCode } from './upstreams.js'

/**
 * data.gov.in refuses requests from Google Cloud addresses (403) but answers the Vercel Mumbai
 * deployment, so the Cloud Run API sends its data.gov.in calls through that deployment.
 *
 * - `viaRelay` (sender, Cloud Run): a fetch that rewrites https://api.data.gov.in/... to
 *   <relay>/relay/data-gov-in/..., moving the API key out of the query string into a header.
 * - `relayRoute` (receiver, Vercel): forwards only the two Agmarknet price resources, and only for a
 *   caller that presents this server's own data.gov.in key, so it is not an open proxy and needs no
 *   extra secret. Responses pass through unchanged; nothing is stored or logged beyond the path.
 */

const UPSTREAM = 'https://api.data.gov.in'
const KEY_HEADER = 'x-arth-relay-key'
const RESOURCES = new Set([
  '9ef84268-d588-465a-a308-a864a43d0070', // today's mandi prices
  '35985678-0d79-46b4-9ed6-6f13308a1d24', // mandi price history
])

export function viaRelay(relayUrl: string, fetchFn: typeof fetch = fetch): typeof fetch {
  const base = relayUrl.replace(/\/+$/, '')
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== UPSTREAM) return fetchFn(input, init)
    const key = url.searchParams.get('api-key') ?? ''
    url.searchParams.delete('api-key')
    const headers = new Headers(init?.headers)
    headers.set(KEY_HEADER, key)
    return fetchFn(`${base}/relay/data-gov-in${url.pathname}${url.search}`, { ...init, headers })
  }) as typeof fetch
}

export function relayRoute(apiKey: string, fetchFn: typeof fetch = fetch) {
  const r = new Hono()
  r.get('/resource/:id', async (c) => {
    if (!apiKey || !sameKey(c.req.header(KEY_HEADER) ?? '', apiKey)) return errorBody(c, 403, 'forbidden', 'Not allowed')
    const id = c.req.param('id')
    if (!RESOURCES.has(id)) return errorBody(c, 404, 'not_found', 'No such resource')
    const qs = new URL(c.req.url).searchParams
    qs.set('api-key', apiKey)
    let res: Response
    try {
      res = await fetchFn(`${UPSTREAM}/resource/${id}?${qs}`, { signal: AbortSignal.timeout(25_000) })
    } catch (err) {
      return errorBody(c, 502, 'upstream_unavailable', `data.gov.in did not answer (${errorCode(err)})`)
    }
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    })
  })
  return r
}

function sameKey(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
