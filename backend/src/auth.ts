import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { ApiError } from './errors.js'

/** Who a verified token belongs to. `email` is kept only when Google says the address is verified. */
export interface Identity {
  uid: string
  email: string | null
}

/**
 * Verifies a Firebase ID token and returns the user ID (the JWT `sub`), or the full identity.
 * A bare string is a UID with no verified email (tests and older callers).
 */
export type TokenVerifier = (token: string) => Promise<string | Identity>

/** Google's public keys for Firebase ID tokens (rotated by Google; jose caches and refetches them). */
const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

/**
 * Firebase ID token check as Firebase documents it for third-party JWT libraries: RS256 signature by
 * Google's securetoken keys, issuer https://securetoken.google.com/<project>, audience <project>, not
 * expired, issued and authenticated in the past, and a non-empty `sub` of at most 128 characters.
 * Done with `jose` rather than firebase-admin/auth, whose key fetcher (jwks-rsa) cannot load on
 * serverless Node runtimes without require(esm).
 */
export function firebaseVerifier(projectId: string, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(FIREBASE_JWKS))): TokenVerifier {
  if (!projectId) throw new Error('firebaseVerifier needs the Firebase project ID')
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
      clockTolerance: 5,
    })
    const now = Date.now() / 1000 + 5
    const sub = payload.sub
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) throw new Error('bad sub')
    if (typeof payload.iat !== 'number' || payload.iat > now) throw new Error('issued in the future')
    if (typeof payload.auth_time !== 'number' || payload.auth_time > now) throw new Error('authenticated in the future')
    // the email only counts when Google has verified it (an unverified address proves nothing)
    const email = typeof payload.email === 'string' && payload.email_verified === true ? payload.email.trim().toLowerCase() : null
    return { uid: sub, email }
  }
}

export type AuthVars = { uid: string; email: string | null }

/** SPEC §5.2: the UID comes only from the verified token, never from the body or query. */
export function requireAuth(verify: TokenVerifier): MiddlewareHandler<{ Variables: AuthVars }> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(header)
    if (!match?.[1]) throw new ApiError(401, 'unauthorized', 'Sign in required')
    let who: Identity
    try {
      const r = await verify(match[1])
      who = typeof r === 'string' ? { uid: r, email: null } : r
    } catch {
      throw new ApiError(401, 'unauthorized', 'Invalid or expired sign-in')
    }
    c.set('uid', who.uid)
    c.set('email', who.email)
    await next()
  }
}
