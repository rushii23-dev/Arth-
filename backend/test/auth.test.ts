import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { firebaseVerifier, type TokenVerifier } from '../src/auth.js'

const PROJECT = 'arth-solo-2026'
const now = () => Math.floor(Date.now() / 1000)

const good = () => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: 'farmer-uid-1',
  iat: now() - 60,
  exp: now() + 3600,
  auth_time: now() - 120,
})

describe('Firebase ID token check', () => {
  let googleKey: CryptoKey
  let otherKey: CryptoKey
  let verify: TokenVerifier
  const sign = (claims: Record<string, unknown>, key = googleKey) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).sign(key)

  beforeAll(async () => {
    const google = await generateKeyPair('RS256')
    googleKey = google.privateKey
    otherKey = (await generateKeyPair('RS256')).privateKey
    const jwk = { ...(await exportJWK(google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' } as JWK
    verify = firebaseVerifier(PROJECT, createLocalJWKSet({ keys: [jwk] }))
  })

  it('accepts a valid token and returns its sub as the user ID', async () => {
    expect(await verify(await sign(good()))).toBe('farmer-uid-1')
  })

  it('rejects another project, another issuer, an expired token and future times', async () => {
    await expect(verify(await sign({ ...good(), aud: 'someone-else' }))).rejects.toThrow()
    await expect(verify(await sign({ ...good(), iss: 'https://securetoken.google.com/someone-else' }))).rejects.toThrow()
    await expect(verify(await sign({ ...good(), exp: now() - 60 }))).rejects.toThrow()
    await expect(verify(await sign({ ...good(), auth_time: now() + 600 }))).rejects.toThrow()
    await expect(verify(await sign({ ...good(), iat: now() + 600 }))).rejects.toThrow()
  })

  it('rejects an empty sub and a token without auth_time', async () => {
    await expect(verify(await sign({ ...good(), sub: '' }))).rejects.toThrow()
    const { auth_time: _, ...noAuthTime } = good()
    await expect(verify(await sign(noAuthTime))).rejects.toThrow()
  })

  it('rejects a token signed by any other key, and an unsigned one', async () => {
    await expect(verify(await sign(good(), otherKey))).rejects.toThrow()
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    await expect(verify(`${enc({ alg: 'none', kid: 'k1' })}.${enc(good())}.`)).rejects.toThrow()
  })

  it('needs a project ID', () => {
    expect(() => firebaseVerifier('')).toThrow()
  })
})
