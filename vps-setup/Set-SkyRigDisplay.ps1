$ErrorActionPreference = "Continue"
$logFile = "C:\SkyRig\verifier.log"
$taskName = "SkyRigDisplayConfig"
function Write-D { param([string]$m) Add-Content -Path $logFile -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] [display] " + $m) }

try {
    Write-D "Display-config task starting; waiting for desktop to settle."
    Start-Sleep -Seconds 25

    if (-not ("SkyRigDisplay" -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class SkyRigDisplay {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DISPLAY_DEVICE {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    const int ENUM_CURRENT_SETTINGS = -1;
    const int DISPLAY_DEVICE_ATTACHED_TO_DESKTOP = 0x1;
    const int CDS_UPDATEREGISTRY = 0x1;
    const int CDS_NORESET = 0x10000000;
    const int DISP_CHANGE_SUCCESSFUL = 0;
    const int DM_POSITION = 0x20;
    const int DM_BITSPERPEL = 0x40000;
    const int DM_PELSWIDTH = 0x80000;
    const int DM_PELSHEIGHT = 0x100000;
    const int DM_DISPLAYFLAGS = 0x200000;
    const int DM_DISPLAYFREQUENCY = 0x400000;

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern bool EnumDisplayDevices(string lpDevice, int iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, int dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, int dwflags, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern int ChangeDisplaySettingsEx(string lpszDeviceName, IntPtr lpDevMode, IntPtr hwnd, int dwflags, IntPtr lParam);

    static string DeviceText(DISPLAY_DEVICE dd) {
        return ((dd.DeviceName ?? "") + " " + (dd.DeviceString ?? "") + " " + (dd.DeviceID ?? "") + " " + (dd.DeviceKey ?? "")).ToLowerInvariant();
    }

    static bool IsSkyRigVirtualDisplay(DISPLAY_DEVICE dd) {
        string haystack = DeviceText(dd);
        return haystack.Contains("virtual display") ||
               haystack.Contains("mttvdd") ||
               haystack.Contains("datronicsoft") ||
               haystack.Contains("parsec") ||
               haystack.Contains("psccdd0");
    }

    static string MonitorText(string deviceName, ref string diag) {
        string text = "";
        for (int j = 0; j < 16; j++) {
            DISPLAY_DEVICE mon = new DISPLAY_DEVICE();
            mon.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(deviceName, j, ref mon, 0)) break;

            string line = "  monitor=" + mon.DeviceName + "|" + mon.DeviceString + "|" + mon.DeviceID;
            diag += line + "\n";
            text += " " + DeviceText(mon);
        }
        return text;
    }

    static bool IsVgxDesktopOutput(DISPLAY_DEVICE dd, string monitorText) {
        if (IsSkyRigVirtualDisplay(dd)) return false;

        string haystack = DeviceText(dd) + " " + (monitorText ?? "").ToLowerInvariant();
        return haystack.Contains("nvidia vgx") ||
               haystack.Contains("vgx");
    }

    static bool IsMicrosoftBasicDesktopOutput(DISPLAY_DEVICE dd, string monitorText) {
        if (IsSkyRigVirtualDisplay(dd)) return false;

        string haystack = DeviceText(dd) + " " + (monitorText ?? "").ToLowerInvariant();
        return haystack.Contains("microsoft basic display") ||
               haystack.Contains("wired display");
    }

    public static string[] SetPrimary(int width, int height, int hz) {
        string target = null;
        string diag = "";

        for (int i = 0; i < 32; i++) {
            DISPLAY_DEVICE dd = new DISPLAY_DEVICE();
            dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(null, i, ref dd, 0)) break;

            bool attached = (dd.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP) != 0;
            diag += dd.DeviceName + "|" + dd.DeviceString + "|" + dd.DeviceID + "|attached=" + attached + "\n";
            MonitorText(dd.DeviceName, ref diag);
            if (attached && IsSkyRigVirtualDisplay(dd)) {
                target = dd.DeviceName;
                break;
            }
        }

        if (target == null) return new string[] { "NOT_FOUND", diag };

        DEVMODE targetMode = new DEVMODE();
        targetMode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
        if (!EnumDisplaySettings(target, ENUM_CURRENT_SETTINGS, ref targetMode)) return new string[] { "ENUM_FAILED", diag };

        targetMode.dmFields = DM_POSITION | DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY;
        targetMode.dmPositionX = 0;
        targetMode.dmPositionY = 0;
        targetMode.dmPelsWidth = width;
        targetMode.dmPelsHeight = height;
        targetMode.dmDisplayFrequency = hz;
        int rc = ChangeDisplaySettingsEx(target, ref targetMode, IntPtr.Zero, CDS_UPDATEREGISTRY | CDS_NORESET, IntPtr.Zero);
        if (rc != DISP_CHANGE_SUCCESSFUL) return new string[] { "TARGET_FAILED:" + rc, diag };

        int nextX = width;
        for (int i = 0; i < 32; i++) {
            DISPLAY_DEVICE dd = new DISPLAY_DEVICE();
            dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
            if (dd.DeviceName == target) continue;
            if ((dd.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP) == 0) continue;

            string monitorText = MonitorText(dd.DeviceName, ref diag);
            if (IsVgxDesktopOutput(dd, monitorText) || IsMicrosoftBasicDesktopOutput(dd, monitorText)) {
                DEVMODE detach = new DEVMODE();
                detach.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
                detach.dmFields = DM_POSITION | DM_PELSWIDTH | DM_PELSHEIGHT | DM_BITSPERPEL | DM_DISPLAYFREQUENCY | DM_DISPLAYFLAGS;
                int detachRc = ChangeDisplaySettingsEx(dd.DeviceName, ref detach, IntPtr.Zero, CDS_UPDATEREGISTRY | CDS_NORESET, IntPtr.Zero);
                diag += "detach=" + dd.DeviceName + "|" + dd.DeviceString + "|rc=" + detachRc + "\n";
                continue;
            }

            DEVMODE mode = new DEVMODE();
            mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            if (!EnumDisplaySettings(dd.DeviceName, ENUM_CURRENT_SETTINGS, ref mode)) continue;
            mode.dmFields = DM_POSITION;
            mode.dmPositionX = nextX;
            mode.dmPositionY = 0;
            ChangeDisplaySettingsEx(dd.DeviceName, ref mode, IntPtr.Zero, CDS_UPDATEREGISTRY | CDS_NORESET, IntPtr.Zero);
            nextX += Math.Max(mode.dmPelsWidth, 1);
        }

        int finalRc = ChangeDisplaySettingsEx(null, IntPtr.Zero, IntPtr.Zero, 0, IntPtr.Zero);
        return new string[] { "OK:" + finalRc, diag };
    }
}
"@ -ErrorAction Stop
    }

    $result = $null
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        $result = [SkyRigDisplay]::SetPrimary(2560, 1440, 144)
        if ($result[0] -like "OK:*") { break }
        Start-Sleep -Seconds 6
    }
    if ($result -and $result.Count -gt 1 -and $result[1]) {
        $result[1].Split("`n") | ForEach-Object { if ($_ -ne "") { Write-D "saw: $_" } }
    }
    if ($result -and $result[0] -like "OK:*") {
        Write-D "Virtual Display Driver set primary at 2560x1440@144; VGX/Wired desktop outputs detached when present ($($result[0]))."
    } else {
        Write-D ("Primary-display request did not succeed: " + $(if ($result) { $result[0] } else { "(null)" }))
    }
} catch {
    Write-D "Display-config error: $($_.Exception.Message)"
} finally {
    try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
}
exit 0
