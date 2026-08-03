$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$logDir = "C:\SkyRig"
$logFile = "$logDir\verifier.log"
$taskName = "SkyRigPostRestartVerifier"

function Write-V { param([string]$m) Add-Content -Path $logFile -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $m) }

try {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-V "Post-restart verifier starting."
    Start-Sleep -Seconds 20

    # Re-disable Microsoft Basic Display Adapter if it came back during EC2Launch's PnP pass.
    $mbda = @(Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | Where-Object {
        $_.FriendlyName -match 'Microsoft Basic Display' -and $_.Status -ne 'Disabled'
    })
    foreach ($d in $mbda) {
        try {
            Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop
            Write-V "Re-disabled MBDA: $($d.InstanceId)"
        } catch {
            Write-V "MBDA re-disable failed for $($d.InstanceId): $($_.Exception.Message)"
        }
    }
    if ($mbda.Count -eq 0) { Write-V "MBDA already disabled or absent." }

    $defaultMonitors = @(Get-PnpDevice -Class Monitor -ErrorAction SilentlyContinue | Where-Object {
        $_.Status -ne 'Disabled' -and
        $_.FriendlyName -notmatch 'Parsec|Virtual Display|MTT' -and
        ($_.FriendlyName -match 'VGX|Generic Non-PnP|Default Monitor' -or $_.InstanceId -match '^DISPLAY\\DEFAULT_MONITOR')
    })
    foreach ($m in $defaultMonitors) {
        try {
            Disable-PnpDevice -InstanceId $m.InstanceId -Confirm:$false -ErrorAction Stop
            Write-V "Disabled VGX/default monitor output: $($m.FriendlyName) [$($m.InstanceId)]"
        } catch {
            Write-V "VGX/default monitor disable failed for $($m.InstanceId): $($_.Exception.Message)"
        }
    }
    if ($defaultMonitors.Count -eq 0) { Write-V "VGX/default monitor outputs already disabled or absent." }

    # Report whether the Virtual Display Driver re-attached on this boot. Root\MttVDD is
    # always-on with no helper service, so absence here means the driver install regressed.
    $vdd = @(Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
        $_.FriendlyName -match 'Virtual Display Driver|MttVDD' -or $_.InstanceId -match '^ROOT\\MTTVDD'
    })
    if ($vdd.Count -gt 0) {
        Write-V "Virtual Display Driver present after reboot (status: $($vdd[0].Status))."
    } else {
        Write-V "WARNING: Virtual Display Driver node missing after reboot."
    }
} catch {
    Write-V "Verifier error: $($_.Exception.Message)"
} finally {
    # Unconditionally self-unregister so this never runs on subsequent boots.
    try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
}
exit 0
