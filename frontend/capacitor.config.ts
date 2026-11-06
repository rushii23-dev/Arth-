import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native Android shell around the same web build (`dist/`). The app is
 * served from https://localhost inside the WebView, so the backend's
 * ARTH_CORS_ORIGINS must include that origin (see docs/ANDROID.md).
 */
const config: CapacitorConfig = {
  appId: 'in.arth.app',
  appName: 'Arth',
  webDir: 'dist',
  android: {
    // http:// API on the PC's LAN IP during development; Cloud Run is https
    allowMixedContent: true,
  },
  plugins: {
    FirebaseAuthentication: {
      // Google sign-in runs natively; the app then signs the Firebase JS SDK in with
      // the returned credential, so the rest of the app keeps using firebase/auth.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
}

export default config
