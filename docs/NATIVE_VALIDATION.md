# Android device validation

Target device: Moto Edge 50 Fusion. Physical-device tests are pending until the phone is connected and authorizes USB debugging.

## Tooling checks completed on 2026-10-11

- Node.js 22.23.3.
- `expo install --check`: dependencies match the pinned SDK.
- Expo Doctor: 18/18 checks passed.
- Android and iOS production JavaScript/Hermes bundles exported successfully.

These checks do not compile an APK/IPA or verify native rendering, storage, lifecycle, or touch behavior. No iOS device or Xcode environment was available.

## Connect the Android phone

1. Enable Developer options and USB debugging, connect a data-capable USB cable, and accept the computer's debugging prompt.
2. Run `adb devices -l`. The phone must appear with status `device`; `unauthorized` requires confirmation on the phone.
3. Use the [official Expo Go build for SDK 54](https://expo.dev/go?sdkVersion=54&platform=android&device=true), or an SDK 54 development build. Do not assume the Play Store build supports this pinned SDK.
4. Start Metro with `npm start`. To connect over USB, run `adb reverse tcp:8081 tcp:8081`, then open `exp://127.0.0.1:8081` in Expo Go.
5. For API mode, also run `adb reverse tcp:3001 tcp:3001`, start the API with `DEMO_MODE=true`, set `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001` before starting Metro, and reload the app.

This workspace has a local ADB executable at `.tmp/android-tools/platform-tools/adb.exe`. The ignored `.tmp` tools are not installed globally or included in Git.

## Record device evidence

Record the Android version, Expo Go/development-build version, app commit, mode, and pass/fail for each scenario:

| Scenario | Expected behavior | Result |
| --- | --- | --- |
| Launch and four tabs | Explore, Community, Trips, Profile render without native crashes | Pending |
| Search and keyboard | Filters work; keyboard does not hide required controls | Pending |
| Trail details | Scroll, safe-area insets, and close controls work | Pending |
| Save and restart | Saved trail survives closing/reopening the app | Pending |
| Report, comment, like | Valid entries appear and persist; invalid dates are rejected | Pending |
| Join/cancel/approve | Membership changes persist and respect organizer rules | Pending |
| Background/resume | App returns without losing saved state | Pending |
| API restart/network loss | Errors are visible; no silent switch to local data | Pending |
| Local mode offline | Loaded demo can mutate/persist without API access | Pending |

Expo Go testing does not verify a standalone release binary. GPS tracking, offline maps, media uploads, and real login are not implemented and cannot be validated by these checks.
