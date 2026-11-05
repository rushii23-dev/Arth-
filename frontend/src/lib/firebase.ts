import type { Auth } from 'firebase/auth'
import { env } from './env'
import { isNativeApp } from './platform'

/**
 * Firebase Auth, loaded on first use so the SDK stays out of the first paint.
 * Google sign-in is the only way in.
 */

type AuthModule = typeof import('firebase/auth')

let authPromise: Promise<Auth> | null = null
let ready: { auth: Auth; mod: AuthModule } | null = null

export function getFirebaseAuth(): Promise<Auth> {
  if (!env.firebase) return Promise.reject(new Error('firebase-not-configured'))
  authPromise ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, mod]) => {
    const firebaseApp = app.initializeApp(env.firebase!)
    // In the Android app there is no popup or redirect, so skip getAuth()'s
    // popup/redirect resolver and keep the session in IndexedDB like the web does.
    const instance = isNativeApp
      ? mod.initializeAuth(firebaseApp, { persistence: [mod.indexedDBLocalPersistence, mod.browserLocalPersistence] })
      : mod.getAuth(firebaseApp)
    instance.useDeviceLanguage()
    ready = { auth: instance, mod }
    return instance
  })
  return authPromise
}

/**
 * The loaded SDK, or null while it is still downloading. Sign-in uses this to
 * open Google's popup synchronously inside the click: browsers block or delay a
 * popup opened after an `await`, which is what made sign-in fail on slow networks.
 */
export function firebaseReady(): { auth: Auth; mod: AuthModule } | null {
  return ready
}

/**
 * Android app only: pick a Google account with the system sheet (Credential
 * Manager, via @capacitor-firebase/authentication), then sign the Firebase JS
 * SDK in with that Google credential. From there on the app sees the same
 * firebase/auth user, ID token and onIdTokenChanged events as on the web.
 */
export async function signInWithGoogleNative(): Promise<void> {
  const [{ FirebaseAuthentication }, auth, mod] = await Promise.all([
    import('@capacitor-firebase/authentication'),
    getFirebaseAuth(),
    import('firebase/auth'),
  ])
  const result = await FirebaseAuthentication.signInWithGoogle()
  const idToken = result.credential?.idToken
  if (!idToken) throw new Error('google-sign-in-no-token')
  await mod.signInWithCredential(auth, mod.GoogleAuthProvider.credential(idToken))
}

/** Android app only: forget the chosen Google account so the next sign-in asks again. */
export async function signOutNative(): Promise<void> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
  await FirebaseAuthentication.signOut()
}
