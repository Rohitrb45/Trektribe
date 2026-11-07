# Android offline validation build

This build packages the app's JavaScript/Hermes bundle inside the APK, so Metro is not needed at launch. It uses the generated Android project's release variant for non-debuggable execution. The current generated project signs that variant with the development debug key: this is a local validation artifact, not a store/production release. The API's production startup guard remains unchanged.

## Build on Windows

From the repository root, with Android Studio SDK and JDK 17 installed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android.ps1 -OfflinePreview -Architecture x86_64
```

The helper selects the local JDK/Node tooling when present, uses the existing short build drive and a short dependency CMake staging directory, builds `assembleRelease`, then checks the APK's embedded bundle, native ABI, signature, package name and non-debuggable manifest. `-OfflinePreview` implies build-only: it does not launch an emulator, install over an existing app or publish anything. It temporarily sets `NODE_ENV=production` for the mobile bundle and restores the caller's previous value afterwards. This does not change the API's environment.

Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

For the Moto Edge 50 Fusion, replace `x86_64` with `arm64-v8a`. The x86_64 APK is for a matching emulator, not the phone. Each build replaces the same output path, so keep architectures separate if retaining both artifacts. Physical-device testing remains deferred.

The bundle captures your current public Expo environment configuration. Updating `.env.local` requires rebuilding this APK. Preserve existing Mapbox/OIDC settings. If native dependencies/plugins changed since the Android directory was generated, first run `npx expo prebuild --platform android --no-install` from `apps/mobile`.

## Install deliberately

Once the intended test emulator/device is connected, check `adb devices` and specify its serial if more than one device is connected:

```powershell
adb -s YOUR_DEVICE_SERIAL install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb -s YOUR_DEVICE_SERIAL shell am start -n com.trektribe.app/.MainActivity
```

`install -r` preserves existing app data when package/signature/version are compatible. If Android reports a signing mismatch, stop and inspect the installed build; uninstalling would erase its local recordings and downloads. This release-variant validation APK has no Metro/debug menu. Connected API testing should use an HTTPS endpoint; the generated release manifest may reject development HTTP URLs that work in a debug build.

## Prove cold startup without network

1. Launch while online, save a trail copy, and complete its map-area download. Create/finish a short recording if the test device's GPS setup permits it.
2. Stop Metro. Turn off Wi-Fi/mobile data on the target. Force-stop TrekTribe through device settings (do not clear its storage).
3. Launch from the app icon. Open **Offline trails** without waiting for sign-in/API availability; inspect the saved route and supported downloaded terrain. Open the local recording list and inspect saved points.
4. Force-stop/reopen again and confirm local data remains. Restore network access afterwards.

The APK checks prove packaging, not native UI success or offline map coverage. Record emulator/device model, ABI, APK SHA-256, screenshots and the exact successful/failed steps in VERIFICATION.md. Live OIDC, remote uploads/restores and uncached map regions still require a network. iOS offline startup requires a separate iOS build.

To verify an already-built APK independently:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-offline-apk.ps1 -Apk apps/mobile/android/app/build/outputs/apk/release/app-release.apk -Architecture x86_64
```

The Windows helper configures dependency CMake intermediates through Android's [buildStagingDirectory](https://android.googlesource.com/platform/tools/base/+/HEAD/build-system/gradle-api/src/main/java/com/android/build/api/dsl/Cmake.kt) option. This avoids long physical node_modules paths without editing dependencies. Generated native caches remain under the ignored .tmp/cxx directory. Offline builds disable Kotlin incremental compilation because mixed physical/subst roots can break its cache; normal Gradle up-to-date checks still apply.

## Repeatable emulator smoke check

With the bundled validation APK installed and the emulator fully booted, run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android-offline-smoke.ps1 -Serial emulator-5554
```

Use the emulator serial shown by `adb devices`. This command accepts emulator serials only. It does not install, uninstall, clear app storage, start a GPS recording or upload anything. It force-stops the app twice, so finish any active test recording beforehand. It enables airplane mode, disables Wi-Fi/mobile data, requires Android to report no active default network, and checks that both cold starts reach the app and open Offline trails and Recordings. It restores and verifies the original radio settings in a finally block, including on failure.

Screenshots, UI XML, connectivity state and the successful result are written under `.tmp/offline-smoke-<timestamp>` (ignored by Git). These files can contain locally displayed trail/recording details; review them before sharing. A pass proves navigation, not saved-content integrity, GPS capture, downloaded-map coverage or account sync. Continue with the manual content checks above. Unknown radio/connectivity formats fail closed; inspect the evidence and restore settings manually if the emulator disconnects during cleanup.

On the 8 GB Windows test PC, Small_Phone/API 37 booted using `-memory 1024 -cores 2 -no-snapshot -no-window -gpu host`. The normal larger emulator configuration had previously stalled under memory pressure. A visible emulator window is optional; this script uses ADB UI capture.
