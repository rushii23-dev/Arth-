# Arth for Android

The Android app is the same React build as the PWA, wrapped by
[Capacitor](https://capacitorjs.com) in a native shell (`frontend/android/`).
The web/PWA build does not change: `npm run build` works as before.

| | Web / PWA | Android app |
| :--- | :--- | :--- |
| Build | `npm run build` | `npm run build:android` (Vite mode `android`, then `cap sync`) |
| Origin | your host / `http://localhost:5173` | `https://localhost` (inside the WebView) |
| API base | `/api` (Vite proxy in dev) | absolute `VITE_API_BASE_URL` from `.env.android.local` |
| Google sign-in | Firebase popup | system account sheet (`@capacitor-firebase/authentication`), then the Firebase JS SDK signs in with that credential |
| Service worker | yes (vite-plugin-pwa) | none: the files ship inside the APK |
| Camera / mic | browser prompt | Android runtime prompt, asked the first time |

App id `in.arth.app`, name **Arth**. iOS is not set up.

## How sign-in works in the app

Firebase's `signInWithPopup` cannot open inside an Android WebView. When
`Capacitor.isNativePlatform()` is true (`src/lib/platform.ts`), `signInWithGoogle`
in `src/features/auth/AuthProvider.tsx` calls `signInWithGoogleNative()`
(`src/lib/firebase.ts`): Android's Credential Manager shows the Google accounts on
the phone, the plugin returns a Google ID token (`skipNativeAuth: true` in
`capacitor.config.ts`), and `signInWithCredential` signs the **Firebase JS SDK** in.
From then on everything is the same as on the web: `onIdTokenChanged`, the
one-hour token refresh and the `Authorization: Bearer <Firebase ID token>` header
from `src/lib/session.ts`. Sign-out also clears the chosen account on the phone.

## 1 · Prerequisites

- **Android Studio** (it brings the Android SDK and a JDK, "JBR", under
  `<Android Studio>/jbr`). Gradle needs JDK 21 or newer; Android Studio's JBR is the
  simplest choice.
- From Android Studio → *SDK Manager*: **Android SDK Platform 36** and Build-Tools
  (Gradle downloads missing platforms itself when the licences are accepted).
- **Node.js 20+** and the frontend dependencies (`cd frontend && npm ci`).
- A phone with Android 7.0+ (API 24) and Google Play services, or an emulator image
  "with Google Play" (Google sign-in needs Play services).

Command-line builds need two environment variables (Android Studio sets them itself):

```powershell
$env:JAVA_HOME = "D:\Android Studio\jbr"     # your Android Studio folder
$env:ANDROID_HOME = "D:\Android SDk"         # Android Studio -> Settings -> Android SDK -> location
```

(Instead of `ANDROID_HOME` you can put `sdk.dir=D\:\\Android SDk` in
`frontend/android/local.properties`; that file is git-ignored.)

## 2 · Firebase setup (manual, once)

The Firebase **web** config in `frontend/.env.local` stays as it is. The Android app
is added to the **same** Firebase project:

1. Get the SHA-1 of your debug signing key. The debug keystore is created by the
   first debug build (or by Android Studio) at `%USERPROFILE%\.android\debug.keystore`:

   ```powershell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```

   or, from `frontend/android`: `./gradlew signingReport` (look at `Variant: debug`).
2. Firebase console → **Project settings** → **Your apps** → **Add app** → Android.
   - Package name: `in.arth.app`
   - Debug signing certificate SHA-1: the value from step 1 (it is required for
     Google sign-in).
3. **Authentication → Sign-in method → Google** must be enabled (it already is for
   the web app).
4. Download **`google-services.json`** and put it at
   **`frontend/android/app/google-services.json`**. It is git-ignored: never commit it.
   If you add a SHA-1 later, download the file again.
5. Before a release build, add the SHA-1 (and SHA-256) of your **release** key too,
   and of the Play App Signing key if you publish through Google Play.

Without `google-services.json` the APK still builds, but Google sign-in fails on
the phone.

## 3 · Point the app at the backend

There is no Vite `/api` proxy inside the app, so the API base must be an absolute URL.

```powershell
cd frontend
copy .env.android.example .env.android.local
```

Set `VITE_API_BASE_URL` in `.env.android.local`:

- **Now (local backend):** your PC's LAN IP, e.g. `http://192.168.1.20:8000`
  (`ipconfig` → *IPv4 Address* of the Wi-Fi adapter). The phone must be on the same
  Wi-Fi, and Windows Firewall must allow inbound TCP 8000 for Node. Plain `http`
  works only in **debug** builds (`android/app/src/debug/AndroidManifest.xml`
  allows cleartext there); release builds are https-only.
- **Later:** the Cloud Run `https://…run.app` URL.

`build:android` stops with an error if this is not an absolute `http(s)://` URL.

**Backend CORS:** the app's origin is `https://localhost`, so the backend's
`ARTH_CORS_ORIGINS` must include it, e.g.

```
ARTH_CORS_ORIGINS=http://localhost:5173,https://localhost
```

(in `backend/.env` locally, and in the Cloud Run service's environment).

## 4 · Build and sync

```powershell
cd frontend
npm run build:android
```

This type-checks, builds `dist/` in mode `android` (no service worker, no web
manifest, `.env.android.local` applied on top of `.env.local`), and copies it into
`android/app/src/main/assets/public` with `npx cap sync android`. Run it again after
every frontend change.

## 5 · Build a debug APK

Either open the project in Android Studio and press **Run** (or *Build → Build
App Bundle(s) / APK(s) → Build APK(s)*):

```powershell
npm run android:open      # = npx cap open android
```

or build from the command line:

```powershell
cd frontend/android
./gradlew assembleDebug
```

The APK is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

## 6 · Install it on a phone

**USB (recommended):**

1. On the phone: *Settings → About phone →* tap *Build number* 7 times, then
   *Developer options → USB debugging* on.
2. Connect the cable, accept the "Allow USB debugging" prompt, then:

   ```powershell
   & "$env:ANDROID_HOME\platform-tools\adb.exe" devices
   & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
   ```

   (Android Studio's **Run** button does the same.)

**Without a cable:** copy `app-debug.apk` to the phone (Drive, WhatsApp to yourself,
USB file transfer), open it and allow "Install unknown apps" for that app.

**Debugging the WebView:** with the phone connected, open `chrome://inspect` in
Chrome on the PC to get DevTools (console, network) for the running app.

## Camera and microphone

`AndroidManifest.xml` declares `CAMERA`, `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`
(camera and microphone hardware are optional). Nothing in the React code changed:

- **Photos** (`<input type="file" accept="image/*" capture="environment">` in
  `ImagePicker`): Capacitor's WebView asks for the camera permission the first time
  and opens the camera app; the gallery button opens the system picker.
- **Voice** (`getUserMedia` + `MediaRecorder` in `useVoice`): the WebView's
  permission request becomes Android's microphone prompt. If the farmer refuses,
  the page gets `NotAllowedError` and the voice button shows the existing
  "permission denied" message. To ask again, allow it in *Settings → Apps → Arth →
  Permissions*.

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| Sign-in sheet does not appear or fails with "developer error" / code 10 | SHA-1 of the key that signed this APK is missing in Firebase, or `google-services.json` is old/missing. Add the SHA-1, download the file again, rebuild. |
| Account is picked, then sign-in fails (`auth/requests-from-referer-…-are-blocked`) | The Firebase web API key has HTTP-referrer restrictions (Google Cloud console → *Credentials*). Add `https://localhost/*`, the app's origin. |
| "No credentials available" | No Google account on the phone, or the emulator image has no Play services. |
| Every API call fails | `VITE_API_BASE_URL` is wrong or not reachable from the phone (try it in the phone's Chrome), firewall blocks port 8000, or `https://localhost` is missing from `ARTH_CORS_ORIGINS`. |
| Changes do not show up | Run `npm run build:android` again, then rebuild/reinstall. |
| `SDK location not found` | Set `ANDROID_HOME` or `sdk.dir` in `android/local.properties`. |
