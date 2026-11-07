param(
  [Parameter(Mandatory=$true)][string]$Apk,
  [ValidateSet('arm64-v8a','x86_64','')][string]$Architecture = ''
)
$ErrorActionPreference = 'Stop'
$resolvedApk = (Resolve-Path -LiteralPath $Apk).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedApk)
try {
  $bundle = $archive.GetEntry('assets/index.android.bundle')
  if (-not $bundle -or $bundle.Length -eq 0) { throw 'APK does not contain a nonempty bundled JavaScript/Hermes asset.' }
  if ($Architecture -and -not ($archive.Entries | Where-Object { $_.FullName.StartsWith("lib/$Architecture/") -and $_.FullName.EndsWith('.so') })) {
    throw "APK does not contain native libraries for $Architecture."
  }
  Write-Host "Embedded JavaScript/Hermes asset: $($bundle.Length) bytes"
} finally { $archive.Dispose() }
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) { throw 'Install Android SDK Build-Tools to verify the APK signature and manifest.' }
& (Join-Path $buildTools.FullName 'apksigner.bat') verify $resolvedApk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$manifest = & (Join-Path $buildTools.FullName 'aapt.exe') dump badging $resolvedApk
if ($LASTEXITCODE -ne 0) { throw 'APK manifest inspection failed.' }
if ($manifest -match '^application-debuggable') { throw 'Offline validation APK must disable Android developer support.' }
if (-not ($manifest -match "^package: name='com.trektribe.app'")) { throw 'Unexpected APK application ID.' }
Write-Host 'Signature, application ID and non-debuggable manifest verified.'
Write-Host "SHA-256: $((Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256).Hash)"
