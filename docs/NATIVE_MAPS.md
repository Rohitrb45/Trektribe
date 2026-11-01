# Native route maps

The native trail-detail screen uses @rnmapbox/maps 10.3.15 with the Expo config plugin. Web retains a labeled illustrative preview. Native builds also fall back to the illustration when configuration/bindings are unavailable or map loading fails. No GPS permission is requested: this milestone displays route geometry only.

## Setup

1. Create a Mapbox account and obtain a public access token beginning with pk. Review your provider account usage settings.
2. Add EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_public_token to apps/mobile/.env.local (ignored by Git). Never put a secret token in an EXPO_PUBLIC variable.
3. Rebuild the native application with npm run android -w @trektribe/mobile, or npm run ios -w @trektribe/mobile on macOS with Xcode. Expo Go cannot load this SDK. Existing native builds need rebuilding after the plugin is added.
4. Open a trail detail and verify the route line, camera framing, zoom/pan, attribution and provider logo. Test missing/invalid token and network failure; fallback must be labeled.

Official installation: https://rnmapbox.github.io/docs/install . The installed package's plugin/install.md documents its SDK requirements; 10.3.12+ requires Mapbox Maps SDK 11.33.0 or newer. The plugin uses its default SDK configuration.

## Verification limits

The Android x86_64 debug APK compiled, installed and displayed the application on the API 37 emulator. The public token was accepted by the Mapbox style API. Live map rendering is not yet verified: earlier emulator checks encountered disconnected Wi-Fi and SwiftShader shader limits; hardware-graphics acceptance remains pending. ARM64 Android, iOS, device lifecycle and attribution placement still need validation. No physical-device acceptance is claimed. Offline maps, GPS recording, user location and media uploads remain separate work.

## Windows Android build setup (2026-10-28)

Android Studio can bundle Java 25, which does not run this project's Gradle 8.14.3 build. Use JDK 17; do not upgrade Gradle independently of Expo/React Native. A verified Temurin JDK can be kept locally under `.tmp/android-tools/jdk17` or configured through JAVA_HOME.

From the repository root, run `powershell -ExecutionPolicy Bypass -File scripts/android.ps1` to build/install through Expo. Use `-BuildOnly` to assemble without a device. The helper discovers the standard Android SDK and project-local JDK/Node; it sets environment variables only for its process. Start a device through Android Studio Device Manager when testing interactively.

Generated `apps/mobile/android` and `apps/mobile/ios` folders are ignored. Keep native configuration in Expo config/plugins so regeneration preserves it. No token belongs in committed native files.
### Short Windows build paths

The launcher uses an unused drive alias (`T:` by default) for this checkout to avoid Ninja's 260-character filename limit. It refuses to replace a drive belonging to another directory; choose `-Drive U` if needed. The alias stays available for Metro and incremental builds.

For an emulator APK only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android.ps1 -BuildOnly -Architecture x86_64
```

For a Moto/ARM64 APK use `-Architecture arm64-v8a`. A debug APK requires Metro; use the launcher without `-BuildOnly` to install and start through Expo. An emulator APK cannot be used on the Moto phone.

Expo is pinned to 54.0.37 with a root override to avoid mixing newer Expo peer dependencies into this SDK 54 app. Mapbox belongs only in the mobile workspace. Original manifests from before the repair were preserved locally under `.tmp/package.before-android-fix.json` and `.tmp/package-lock.before-android-fix.json`.

## Emulator troubleshooting

- Start the emulator in Android Studio Device Manager before running the launcher. A previously started emulator with `-no-window` can receive the app without displaying it. Stop that emulator, then start it interactively; its window may appear separately from Android Studio.
- Keep the Expo terminal running. Press `a` there to reopen the installed app. Use the Metro port printed in that terminal; it may be 8082 when 8081 is occupied.
- If the map falls back to an illustration, connect the emulator to `AndroidWifi`, then tap **Retry map**. Use Hardware/Automatic emulator graphics: the tested SwiftShader configuration exceeded its vertex-uniform limit when rendering the outdoors style.
- If a build still references old long CMake paths, rerun the helper with `-ResetNativeCache`. This removes only generated native build caches.
