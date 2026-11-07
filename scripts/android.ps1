param([switch]$BuildOnly, [switch]$OfflinePreview, [switch]$ResetNativeCache, [ValidatePattern('^[D-Zd-z]$')][string]$Drive = 'T', [ValidateSet('arm64-v8a','x86_64')][string]$Architecture)
$ErrorActionPreference = 'Stop'
$previousNodeEnv = $env:NODE_ENV
if ($OfflinePreview) { $BuildOnly = $true }
$repo = Split-Path $PSScriptRoot -Parent
# Resolve an invocation through an existing subst alias before comparing paths.
$sourceDrive = [IO.Path]::GetPathRoot($repo).TrimEnd('\')
$sourceMapping = @(& subst) | Where-Object { $_.StartsWith("$sourceDrive\: => ") }
if ($sourceMapping) {
  $sourcePath = ($sourceMapping -split ' => ', 2)[1]
  $repo = [IO.Path]::GetFullPath((Join-Path $sourcePath $repo.Substring($sourceDrive.Length).TrimStart('\')))
}
$physicalRepo = $repo
$driveRoot = "$($Drive.ToUpper()):"
$mapping = @(& subst) | Where-Object { $_.StartsWith("$driveRoot\: => ") }
if ($mapping) {
  $mappedPath = ($mapping -split ' => ', 2)[1]
  if ([IO.Path]::GetFullPath($mappedPath).TrimEnd('\') -ne [IO.Path]::GetFullPath($repo).TrimEnd('\')) {
    throw "$driveRoot is mapped to another folder. Choose another -Drive."
  }
} elseif (Test-Path "$driveRoot/") {
  throw "$driveRoot is already in use. Choose another -Drive."
} else {
  & subst $driveRoot $repo
  if ($LASTEXITCODE -ne 0) { throw 'Could not create short build path.' }
}
# Keep the alias available for Metro and subsequent incremental builds.
$repo = "$driveRoot/"
if ($ResetNativeCache) {
  foreach ($relative in @('build/generated/autolinking','app/build/generated/autolinking','app/.cxx')) {
    $androidRoot = [IO.Path]::GetFullPath("$physicalRepo/apps/mobile/android")
    $cache = [IO.Path]::GetFullPath("$androidRoot/$relative")
    if (-not $cache.StartsWith($androidRoot + '\')) { throw 'Unexpected generated cache path.' }
    if (Test-Path -LiteralPath "\\?\$cache") { Remove-Item -LiteralPath "\\?\$cache" -Recurse -Force }
  }
}
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not (Test-Path "$sdk/platform-tools/adb.exe")) { throw 'Install Android SDK Platform-Tools in Android Studio first.' }
$localJdk = Get-ChildItem "$repo/.tmp/android-tools/jdk17" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 17. Android Studio may bundle a newer incompatible JDK.' }
$env:ANDROID_HOME = $sdk
if ($OfflinePreview) { $env:NODE_ENV = 'production' }
elseif (-not $env:NODE_ENV) { $env:NODE_ENV = 'development' }
$env:Path = "$env:JAVA_HOME/bin;$sdk/platform-tools;$env:Path"
$localNode = "$repo/.tmp/toolchain/node_modules/node/bin"
if (Test-Path "$localNode/node.exe") { $env:Path = "$localNode;$env:Path" }
Push-Location "$repo/apps/mobile"
try {
  if ($BuildOnly) {
    if (-not (Test-Path 'android/gradlew.bat')) {
      & node ../../node_modules/expo/bin/cli prebuild --platform android --no-install
      if ($LASTEXITCODE -ne 0) { throw 'Android prebuild failed.' }
    }
    Push-Location android
    try {
      $buildTask = if ($OfflinePreview) { ':app:assembleRelease' } else { ':app:assembleDebug' }
      $gradleArgs = @($buildTask, '--max-workers=2', '--console=plain')
      if ($OfflinePreview) {
        # Kotlin incremental caches cannot relativize mixed physical/subst roots.
        $gradleArgs += @('--init-script', "$repo/scripts/android-short-paths.gradle", "-PtrektribeNativeStagingRoot=$repo.tmp/cxx", '-Pkotlin.incremental=false')
      }
      if ($Architecture) { $gradleArgs += "-PreactNativeArchitectures=$Architecture" }
      & ./gradlew.bat @gradleArgs
      if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
      if ($OfflinePreview) {
        $apk = Join-Path $physicalRepo 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'
        & "$PSScriptRoot/verify-offline-apk.ps1" -Apk $apk -Architecture $Architecture
        Write-Host "Offline validation APK: $apk"
        Write-Host 'Install manually on the matching device. This is a local validation artifact, not a production release.'
      }
    }
    finally { Pop-Location }
  } else {
    & node ../../node_modules/expo/bin/cli run:android
    if ($LASTEXITCODE -ne 0) { throw 'Android launch failed.' }
  }
} finally {
  Pop-Location
  if ($OfflinePreview) { $env:NODE_ENV = $previousNodeEnv }
}
