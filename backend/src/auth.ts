import type { MiddlewareHandler } from 'hono'
import { getAuth } from 'firebase-admin/auth'
import { ApiError } from './errors.js'

/** Verifies a Firebase ID token and returns the user ID (the JWT `sub`). */
export type TokenVerifier = (token: string) => Promise<string>

export function firebaseVerifier(): TokenVerifier {
  return async (token) => {
    // checks signature, expiry, issuer securetoken.google.com/<project> and audience <project>
    const decoded = await getAuth().verifyIdToken(token)
    return decoded.uid
  }
}

export type AuthVars = { uid: string }

/** SPEC §5.2: the UID comes only from the verified token, never from the body or query. */
export function requireAuth(verify: TokenVerifier): MiddlewareHandler<{ Variables: AuthVars }> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(header)
    if (!match?.[1]) throw new ApiError(401, 'unauthorized', 'Sign in required')
    let uid: string
    try {
      uid = await verify(match[1])
    } catch {
      throw new ApiError(401, 'unauthorized', 'Invalid or expired sign-in')
    }
    c.set('uid', uid)
    await next()
  }
}
