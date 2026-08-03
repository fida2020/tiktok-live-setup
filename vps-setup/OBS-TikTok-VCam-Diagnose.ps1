# OBS Virtual Camera + TikTok LIVE Studio diagnostics
# Safe / read-only. No uninstalls, no registry writes, no service changes.
# Run in elevated PowerShell ON the Windows Server 2025 VPS after reboot.
# Output: Desktop\OBS-TikTok-VCam-Report.txt

$ErrorActionPreference = 'Continue'
$reportPath = Join-Path $env:USERPROFILE 'Desktop\OBS-TikTok-VCam-Report.txt'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s = '') { $script:lines.Add($s); Write-Host $s }

L '=== OBS / TikTok Virtual Camera Diagnostic Report ==='
L ("Generated: {0:yyyy-MM-dd HH:mm:ss zzz}" -f (Get-Date))
L ("Computer:  {0}" -f $env:COMPUTERNAME)
L ("User:      {0}\{1}" -f $env:USERDOMAIN, $env:USERNAME)
L ''

# --- OS / GPU ---
L '--- OS ---'
try {
  $os = Get-CimInstance Win32_OperatingSystem
  L ("Caption:      {0}" -f $os.Caption)
  L ("Version:      {0}" -f $os.Version)
  L ("Build:        {0}" -f $os.BuildNumber)
  L ("Architecture: {0}" -f $os.OSArchitecture)
} catch { L ("OS query failed: {0}" -f $_.Exception.Message) }
L ''
L '--- GPU ---'
try {
  Get-CimInstance Win32_VideoController | ForEach-Object {
    L ("Name:          {0}" -f $_.Name)
    L ("DriverVersion: {0}" -f $_.DriverVersion)
    L ("DriverDate:    {0}" -f $_.DriverDate)
    L ("Status:        {0}" -f $_.Status)
    L ("AdapterRAM:    {0}" -f $_.AdapterRAM)
    L ''
  }
} catch { L ("GPU query failed: {0}" -f $_.Exception.Message) }

# --- Media Foundation ---
L '--- Media Foundation Feature ---'
$sm = Get-Module -ListAvailable ServerManager -ErrorAction SilentlyContinue
if ($sm) {
  Import-Module ServerManager -ErrorAction SilentlyContinue
  try {
    $feat = Get-WindowsFeature Server-Media-Foundation
    L ("Name:         {0}" -f $feat.Name)
    L ("DisplayName:  {0}" -f $feat.DisplayName)
    L ("InstallState: {0}" -f $feat.InstallState)
  } catch { L ("Get-WindowsFeature failed: {0}" -f $_.Exception.Message) }
} else {
  L 'ServerManager module not available; falling back to DISM.'
  try {
    $dism = & dism.exe /Online /Get-FeatureInfo /FeatureName:ServerMediaFoundation 2>&1
    $dism | ForEach-Object { L ($_ | Out-String).TrimEnd() }
  } catch { L ("DISM failed: {0}" -f $_.Exception.Message) }
}
L ''
L '--- MF DLLs ---'
@(
  'mfplat.dll','mf.dll','mfcore.dll','mfreadwrite.dll','mfsrcsnk.dll','mfsensorgroup.dll'
) | ForEach-Object {
  $p = Join-Path $env:SystemRoot "System32\$_"
  L ("{0}: {1}  ({2})" -f $_, (Test-Path $p), $p)
}
L ''

# --- Frame Server ---
L '--- FrameServer services ---'
$svcs = Get-Service FrameServer* -ErrorAction SilentlyContinue
if ($svcs) {
  $svcs | ForEach-Object {
    L ("Name={0} Status={1} StartType={2}" -f $_.Name, $_.Status, $_.StartType)
  }
} else {
  L 'No FrameServer* services found.'
}
L ''

# --- Camera privacy (Server may differ) ---
L '--- Camera capability / privacy registry (read-only) ---'
$privacyPaths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam'
)
foreach ($pp in $privacyPaths) {
  if (Test-Path $pp) {
    try {
      $val = (Get-ItemProperty $pp -ErrorAction Stop).Value
      L ("{0} Value={1}" -f $pp, $val)
    } catch { L ("{0} (exists, no Value or denied)" -f $pp) }
  } else {
    L ("Missing: {0}" -f $pp)
  }
}
L ''

# --- OBS Virtual Camera registration ---
L '--- OBS Virtual Camera DirectShow registration ---'
$obsDllCandidates = @(
  'C:\Program Files\obs-studio\data\obs-plugins\win-dshow\obs-virtualcam-module64.dll',
  'C:\Program Files\obs-studio\bin\64bit\obs-virtualcam-module64.dll'
)
foreach ($dll in $obsDllCandidates) {
  L ("DLL exists {0}: {1}" -f $dll, (Test-Path $dll))
}

# Search CLSID instances for OBS Virtual Camera name
try {
  $instRoot = 'HKLM:\SOFTWARE\Classes\CLSID\{860BB310-5D01-11d0-BD3B-00A0C911CE86}\Instance'
  if (Test-Path $instRoot) {
    $hits = Get-ChildItem $instRoot -ErrorAction SilentlyContinue | ForEach-Object {
      try { Get-ItemProperty $_.PSPath } catch { $null }
    } | Where-Object { $_.FriendlyName -match 'OBS' -or $_.CLSID -match 'OBS' }
    if ($hits) {
      $hits | ForEach-Object {
        L ("FriendlyName={0}" -f $_.FriendlyName)
        L ("CLSID={0}" -f $_.CLSID)
        L ("Path={0}" -f $_.PSPath)
      }
    } else {
      L 'No OBS entry under VideoInputDeviceCategory Instance list.'
    }
  } else {
    L 'VideoInputDeviceCategory Instance key missing.'
  }
} catch { L ("DShow enum failed: {0}" -f $_.Exception.Message) }

# Also scan for obs-virtualcam module registration
try {
  $regHits = & reg.exe query 'HKLM\SOFTWARE\Classes\CLSID' /s /f 'OBS Virtual Camera' 2>$null
  if ($LASTEXITCODE -eq 0 -and $regHits) {
    L 'reg.exe /f OBS Virtual Camera hits (first 40 lines):'
    ($regHits | Select-Object -First 40) | ForEach-Object { L $_ }
  } else {
    L 'reg.exe search for OBS Virtual Camera: no hits or failed.'
  }
} catch { L ("reg search failed: {0}" -f $_.Exception.Message) }
L ''

# --- Processes ---
L '--- Relevant processes ---'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'obs|TikTok|LIVE|MediaSDK|parfait' } |
  Select-Object ProcessName, Id, Path |
  ForEach-Object { L ("{0} PID={1} Path={2}" -f $_.ProcessName, $_.Id, $_.Path) }
if (-not (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'obs|TikTok|LIVE|MediaSDK|parfait' })) {
  L 'OBS / TikTok not currently running.'
}
L ''

# --- OBS logs (latest) ---
L '--- Latest OBS log (camera / virtualcam excerpts) ---'
$obsLogDir = Join-Path $env:APPDATA 'obs-studio\logs'
L ("OBS log dir: {0} exists={1}" -f $obsLogDir, (Test-Path $obsLogDir))
if (Test-Path $obsLogDir) {
  $latestObs = Get-ChildItem $obsLogDir -Filter '*.txt' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latestObs) {
    L ("Latest OBS log: {0} ({1})" -f $latestObs.FullName, $latestObs.LastWriteTime)
    $obsText = Get-Content $latestObs.FullName -ErrorAction SilentlyContinue
    L '--- OBS header / video settings (first 80 matching lines) ---'
    $obsText | Select-String -Pattern 'OS Name|Windows|CPU|output \d|base resolution|output resolution|fps:|format:|YUV|Virtual Cam|virtual.?cam|win-dshow|NV12|Failed|error|warning' -CaseSensitive:$false |
      Select-Object -First 80 |
      ForEach-Object { L $_.Line }
  } else {
    L 'No OBS log files found.'
  }
}
L ''

# --- TikTok LIVE Studio logs ---
L '--- TikTok LIVE Studio logs ---'
$ttRoots = @(
  (Join-Path $env:APPDATA 'TikTok LIVE Studio'),
  (Join-Path $env:LOCALAPPDATA 'TikTok LIVE Studio')
)
foreach ($root in $ttRoots) {
  L ("TT root: {0} exists={1}" -f $root, (Test-Path $root))
}
$ttLogCandidates = @()
foreach ($root in $ttRoots) {
  if (Test-Path $root) {
    $ttLogCandidates += Get-ChildItem $root -Recurse -Include *.log,*.txt -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'log' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 30
  }
}
if ($ttLogCandidates) {
  L 'Recent TikTok-related log files:'
  $ttLogCandidates | Select-Object -First 20 | ForEach-Object {
    L ("{0}  {1:u}  {2} bytes" -f $_.FullName, $_.LastWriteTime, $_.Length)
  }
  # Prefer MediaSDK / parfait / camera related
  $priority = $ttLogCandidates | Where-Object {
    $_.FullName -match 'mediasdk|parfait|camera|capture|meidasdk|MediaSDK'
  } | Select-Object -First 5
  if (-not $priority) { $priority = $ttLogCandidates | Select-Object -First 3 }
  foreach ($lf in $priority) {
    L ''
    L ("--- Excerpts from {0} ---" -f $lf.FullName)
    try {
      Get-Content $lf.FullName -ErrorAction SilentlyContinue |
        Select-String -Pattern 'camera|Camera|OBS|Virtual|DirectShow|Media Foundation|MF_|capture|preview|device|NV12|YUY2|error|fail|HRESULT|0x8' -CaseSensitive:$false |
        Select-Object -Last 60 |
        ForEach-Object { L $_.Line }
    } catch { L ("Read failed: {0}" -f $_.Exception.Message) }
  }
} else {
  L 'No TikTok log files found under AppData.'
}
L ''

# --- Temp TikTok installer/runtime logs ---
L '--- Temp TikTok logs ---'
Get-ChildItem $env:TEMP -Filter 'tiktok*' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 |
  ForEach-Object { L ("{0}  {1:u}" -f $_.FullName, $_.LastWriteTime) }
L ''

# --- DirectShow / MF related Event Log (last 24h, non-destructive) ---
L '--- Event Log: FrameServer / MF / camera (last 24h) ---'
$since = (Get-Date).AddHours(-24)
$providers = @('Microsoft-Windows-FrameServer','Microsoft-Windows-FrameServerMonitor','Microsoft-Windows-MediaFoundation-Platform')
foreach ($prov in $providers) {
  try {
    $ev = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-*/Operational'; ProviderName = $prov; StartTime = $since } -ErrorAction SilentlyContinue |
      Select-Object -First 5
    # Fallback simpler query
  } catch {}
}
try {
  $ev2 = Get-WinEvent -ListLog *FrameServer* -ErrorAction SilentlyContinue
  if ($ev2) {
    $ev2 | ForEach-Object { L ("Log: {0} Enabled={1} RecordCount={2}" -f $_.LogName, $_.IsEnabled, $_.RecordCount) }
    foreach ($log in $ev2) {
      Get-WinEvent -LogName $log.LogName -MaxEvents 15 -ErrorAction SilentlyContinue | ForEach-Object {
        L ("[{0}] {1} Id={2} {3}" -f $_.TimeCreated, $_.LevelDisplayName, $_.Id, ($_.Message -replace '\s+',' ').Substring(0, [Math]::Min(200, ($_.Message -replace '\s+',' ').Length)))
      }
    }
  } else {
    L 'No FrameServer event logs listed.'
  }
} catch { L ("Event log query failed: {0}" -f $_.Exception.Message) }

try {
  Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=$since } -MaxEvents 200 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match 'TikTok|OBS|Media|Frame' -or $_.Message -match 'TikTok|OBS Virtual|mfplat|FrameServer' } |
    Select-Object -First 20 |
    ForEach-Object {
      $msg = ($_.Message -replace '\s+',' ')
      if ($msg.Length -gt 220) { $msg = $msg.Substring(0,220) }
      L ("[{0}] {1} {2} {3}" -f $_.TimeCreated, $_.ProviderName, $_.Id, $msg)
    }
} catch { L ("Application log filter failed: {0}" -f $_.Exception.Message) }
L ''

# --- Guidance block for next manual check ---
L '--- Manual verification checklist (do on VPS GUI) ---'
L '1. Start OBS 32.2.1 -> Start Virtual Camera'
L '2. Open TikTok LIVE Studio 1.32.2 -> select OBS Virtual Camera'
L '3. Note: preview YES or NO'
L '4. Optional: open Chrome -> https://webcamtests.com -> select OBS Virtual Camera -> note YES/NO'
L '5. Optional: if a physical/USB cam exists, test it in TikTok -> YES/NO'
L ''
L '=== END REPORT ==='

$lines | Set-Content -Path $reportPath -Encoding UTF8
Write-Host ''
Write-Host "Report written to: $reportPath"
Write-Host 'Copy that file contents back into Cursor chat.'
