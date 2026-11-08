param(
  [Parameter(Mandatory=$true)][ValidatePattern('^emulator-[0-9]+$')][string]$Serial,
  [string]$SavedTrailTitle = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$evidence = Join-Path $repo ('.tmp/offline-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
function Invoke-Adb {
  param([string[]]$Command)
  # Windows PowerShell wraps adb's successful stderr progress as error records.
  $savedPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $result = & $adb -s $Serial @Command 2>&1
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $savedPreference }
  if ($exitCode -ne 0) { throw "adb $($Command -join ' ') failed (exit $exitCode): $($result -join ' ')" }
  return ($result -join "`n").Trim()
}
function Read-Ui {
  # UIAutomator can report an error with exit 0, leaving an old XML file behind.
  # Remove only our temporary dump so a failed capture cannot pass on stale UI.
  [void](Invoke-Adb @('shell','rm','-f','/sdcard/trektribe-smoke.xml'))
  [void](Invoke-Adb @('shell','uiautomator','dump','/sdcard/trektribe-smoke.xml'))
  [void](Invoke-Adb @('pull','/sdcard/trektribe-smoke.xml',"$evidence/current.xml"))
  return [xml][IO.File]::ReadAllText("$evidence/current.xml")
}
function Find-Label($Ui, [string]$Label) {
  return $Ui.SelectNodes('//node') | Where-Object { $_.text -eq $Label -or $_.'content-desc' -eq $Label } | Select-Object -First 1
}
function Wait-Label([string]$Label) {
  $deadline = (Get-Date).AddSeconds(60)
  $lastFailure = ''
  do {
    try {
      $ui = Read-Ui
      if (Find-Label $ui $Label) { return $ui }
    } catch { $lastFailure = $_.Exception.Message }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "UI did not show '$Label'. Inspect $evidence/current.xml. $lastFailure"
}
function Tap-Label($Ui, [string]$Label) {
  $node = Find-Label $Ui $Label
  if (-not $node -or $node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') { throw "Cannot tap '$Label'." }
  $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
  $y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
  [void](Invoke-Adb @('shell','input','tap',"$x","$y"))
}
function Save-Evidence([string]$Name, $Ui) {
  $Ui.Save("$evidence/$Name.xml")
  [void](Invoke-Adb @('shell','screencap','-p','/sdcard/trektribe-smoke.png'))
  [void](Invoke-Adb @('pull','/sdcard/trektribe-smoke.png',"$evidence/$Name.png"))
}
if ((Invoke-Adb @('get-state')) -ne 'device' -or (Invoke-Adb @('shell','getprop','sys.boot_completed')) -ne '1') { throw 'Wait for the emulator to finish booting.' }
if (-not (Invoke-Adb @('shell','pm','path','com.trektribe.app'))) { throw 'Install the bundled validation APK first.' }
$airplane = Invoke-Adb @('shell','cmd','connectivity','airplane-mode')
$wifi = Invoke-Adb @('shell','settings','get','global','wifi_on')
$data = Invoke-Adb @('shell','settings','get','global','mobile_data')
if ($airplane -notin @('enabled','disabled') -or $wifi -notin @('0','1') -or $data -notin @('0','1')) { throw 'Unsupported radio state; no settings changed.' }
[void](New-Item -ItemType Directory -Path $evidence)
try {
  [void](Invoke-Adb @('shell','cmd','connectivity','airplane-mode','enable'))
  [void](Invoke-Adb @('shell','svc','wifi','disable'))
  [void](Invoke-Adb @('shell','svc','data','disable'))
  Start-Sleep -Seconds 3
  if ((Invoke-Adb @('shell','cmd','connectivity','airplane-mode')) -ne 'enabled' -or (Invoke-Adb @('shell','settings','get','global','wifi_on')) -ne '0' -or (Invoke-Adb @('shell','settings','get','global','mobile_data')) -ne '0') { throw 'Radio isolation was not confirmed.' }
  $connectivity = Invoke-Adb @('shell','dumpsys','connectivity')
  $connectivity | Set-Content "$evidence/connectivity.txt"
  if ($connectivity -notmatch '(?m)^\s*Active default network: none\s*$') { throw 'Android still reports a default network, or its status format is unsupported.' }
  foreach ($round in 1..2) {
    [void](Invoke-Adb @('shell','am','force-stop','com.trektribe.app'))
    [void](Invoke-Adb @('shell','am','start','-n','com.trektribe.app/.MainActivity'))
    $ui = Wait-Label 'Offline trails'
    if (-not (Find-Label $ui 'Record a walk')) { throw 'Recording launcher missing.' }
    Save-Evidence "launch-$round" $ui
    Tap-Label $ui 'Offline trails'
    $ui = Wait-Label 'Close offline trails'
    Save-Evidence "trails-$round" $ui
    if ($SavedTrailTitle) {
      $ui = Wait-Label 'View saved trail'
      Tap-Label $ui 'View saved trail'
      $ui = Wait-Label 'Back to saved copies'
      if (-not (Find-Label $ui $SavedTrailTitle)) { throw "The first saved trail does not match '$SavedTrailTitle'." }
      Save-Evidence "saved-trail-$round" $ui
    }
    Tap-Label $ui 'Close offline trails'
    $ui = Wait-Label 'Record a walk'
    Tap-Label $ui 'Record a walk'
    $ui = Wait-Label 'Close and pause'
    if (-not (Find-Label $ui 'Recordings')) { throw 'Recording screen missing.' }
    Save-Evidence "recordings-$round" $ui
    Tap-Label $ui 'Close and pause'
  }
} finally {
  # Attempt every restoration even if an earlier adb command fails.
  $restore = @(
    @('shell','cmd','connectivity','airplane-mode',$(if ($airplane -eq 'enabled') {'enable'} else {'disable'})),
    @('shell','svc','wifi',$(if ($wifi -eq '1') {'enable'} else {'disable'})),
    @('shell','svc','data',$(if ($data -eq '1') {'enable'} else {'disable'}))
  )
  $restoreErrors = @()
  foreach ($command in $restore) {
    try { [void](Invoke-Adb $command) } catch { $restoreErrors += $_.Exception.Message }
  }
  if ($restoreErrors.Count) { throw "Restore emulator radios manually: $($restoreErrors -join '; ')" }
  $restoreDeadline = (Get-Date).AddSeconds(30)
  do {
    $restored = (Invoke-Adb @('shell','cmd','connectivity','airplane-mode')) -eq $airplane -and (Invoke-Adb @('shell','settings','get','global','wifi_on')) -eq $wifi -and (Invoke-Adb @('shell','settings','get','global','mobile_data')) -eq $data
    if ($restored) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $restoreDeadline)
  if (-not $restored) { throw 'Radio restoration did not match the original settings; inspect the emulator.' }
}
'PASS: two radio-disabled cold starts and local screen navigation; original radio settings restored. Saved content is checked only when SavedTrailTitle is supplied; GPS, map coverage and sync are not asserted.' | Set-Content "$evidence/result.txt"
if ($SavedTrailTitle) {
  "PASS: first saved trail '$SavedTrailTitle' opened after both offline cold starts. Title and viewer navigation checked; geometry accuracy, terrain coverage and GPS are not asserted." | Add-Content "$evidence/result.txt"
}
Write-Host "Offline navigation smoke passed. Evidence: $evidence"
