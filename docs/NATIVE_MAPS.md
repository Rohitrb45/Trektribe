# Native route maps

The native trail-detail screen uses @rnmapbox/maps 10.3.15 with the Expo config plugin. Web retains a labeled illustrative preview. Native builds also fall back to the illustration when configuration/bindings are unavailable or map loading fails. No GPS permission is requested: this milestone displays route geometry only.

## Setup

1. Create a Mapbox account and obtain a public access token beginning with pk. Review your provider account usage settings.
2. Add EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_public_token to apps/mobile/.env.local (ignored by Git). Never put a secret token in an EXPO_PUBLIC variable.
3. Rebuild the native application with npm run android -w @trektribe/mobile, or npm run ios -w @trektribe/mobile on macOS with Xcode. Expo Go cannot load this SDK. Existing native builds need rebuilding after the plugin is added.
4. Open a trail detail and verify the route line, camera framing, zoom/pan, attribution and provider logo. Test missing/invalid token and network failure; fallback must be labeled.

Official installation: https://rnmapbox.github.io/docs/install . The installed package's plugin/install.md documents its SDK requirements; 10.3.12+ requires Mapbox Maps SDK 11.33.0 or newer. The plugin uses its default SDK configuration.

## Verification limits

JavaScript exports and TypeScript do not establish native SDK compatibility. Android Gradle/iOS CocoaPods compilation, real token rendering, device lifecycle and attribution placement still need validation. No physical-device acceptance is claimed. Offline maps, GPS recording, user location and media uploads remain separate work.
