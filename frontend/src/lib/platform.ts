import { Capacitor } from '@capacitor/core'

/**
 * True inside the Android app (Capacitor WebView), false in a browser or the
 * installed PWA. The native app signs in through the system Google account
 * picker and runs without a service worker.
 */
export const isNativeApp = Capacitor.isNativePlatform()
