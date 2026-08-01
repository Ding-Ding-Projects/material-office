param(
  [Parameter(Mandatory = $true)][string]$PackagedExecutable,
  [Parameter(Mandatory = $true)][string]$InstalledExecutable,
  [Parameter(Mandatory = $true)][string]$ShortcutPath,
  [Parameter(Mandatory = $true)][string]$ElectronExecutable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class MaterialOfficeWindowIconProbe
{
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
    private static extern IntPtr GetClassLongPtr64(IntPtr hWnd, int index);

    [DllImport("user32.dll", EntryPoint = "GetClassLongW")]
    private static extern IntPtr GetClassLong32(IntPtr hWnd, int index);

    public static IntPtr GetClassIcon(IntPtr hWnd, int index)
    {
        return IntPtr.Size == 8 ? GetClassLongPtr64(hWnd, index) : GetClassLong32(hWnd, index);
    }
}
'@

function Get-NormalizedIconFingerprint([System.Drawing.Icon]$Icon) {
  $bitmap = [System.Drawing.Bitmap]::new(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawIcon($Icon, [System.Drawing.Rectangle]::new(0, 0, 32, 32))
    } finally {
      $graphics.Dispose()
    }
    $stream = [System.IO.MemoryStream]::new()
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $hash = [System.Security.Cryptography.SHA256]::HashData($stream.ToArray())
      return [Convert]::ToHexString($hash).ToLowerInvariant()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $bitmap.Dispose()
  }
}

function Get-IconFingerprint([string]$Executable) {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path -LiteralPath $Executable))
  if ($null -eq $icon) {
    throw "No associated Windows icon was found for $Executable."
  }
  try {
    return Get-NormalizedIconFingerprint $icon
  } finally {
    $icon.Dispose()
  }
}

$packaged = (Resolve-Path -LiteralPath $PackagedExecutable).Path
$installed = (Resolve-Path -LiteralPath $InstalledExecutable).Path
$shortcut = (Resolve-Path -LiteralPath $ShortcutPath).Path
$electron = (Resolve-Path -LiteralPath $ElectronExecutable).Path

$packagedFingerprint = Get-IconFingerprint $packaged
$installedFingerprint = Get-IconFingerprint $installed
$electronFingerprint = Get-IconFingerprint $electron
if ($packagedFingerprint -ne $installedFingerprint) {
  throw 'The installed executable icon does not match the verified packaged executable icon.'
}
if ($packagedFingerprint -eq $electronFingerprint) {
  throw "The packaged executable still carries Electron's default icon."
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
if ([IO.Path]::GetFullPath($link.TargetPath) -ne [IO.Path]::GetFullPath($installed)) {
  throw "The installed shortcut targets '$($link.TargetPath)' instead of '$installed'."
}
if ($link.IconLocation) {
  $iconLocation = ($link.IconLocation -split ',')[0].Trim('"')
  if ([IO.Path]::GetFullPath($iconLocation) -ne [IO.Path]::GetFullPath($installed)) {
    throw "The shortcut uses an unexpected icon source: $($link.IconLocation)."
  }
}

$started = Start-Process -FilePath $installed -PassThru
try {
  $window = $null
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 250
    $window = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
    if ($window -and $window.MainWindowHandle -ne 0) { break }
  } while ([DateTimeOffset]::UtcNow -lt $deadline)
  if (-not $window -or $window.MainWindowHandle -eq 0) {
    throw 'The installed app did not expose a native main window for icon verification.'
  }
  $handle = [MaterialOfficeWindowIconProbe]::SendMessage($window.MainWindowHandle, 0x007F, [IntPtr]1, [IntPtr]::Zero)
  if ($handle -eq [IntPtr]::Zero) {
    $handle = [MaterialOfficeWindowIconProbe]::SendMessage($window.MainWindowHandle, 0x007F, [IntPtr]0, [IntPtr]::Zero)
  }
  if ($handle -eq [IntPtr]::Zero) {
    $handle = [MaterialOfficeWindowIconProbe]::GetClassIcon($window.MainWindowHandle, -14)
  }
  if ($handle -eq [IntPtr]::Zero) {
    throw 'The installed app window did not expose a Windows icon handle.'
  }
  $windowIcon = [System.Drawing.Icon]([System.Drawing.Icon]::FromHandle($handle).Clone())
  try {
    $windowFingerprint = Get-NormalizedIconFingerprint $windowIcon
  } finally {
    $windowIcon.Dispose()
  }
  if ($windowFingerprint -ne $packagedFingerprint) {
    throw 'The installed app window icon does not match the verified packaged executable icon.'
  }
} finally {
  if (-not $started.HasExited) {
    & "$env:SystemRoot\System32\taskkill.exe" /pid $started.Id /t /f | Out-Null
    # The icon assertion is complete; taskkill may report an unsupported child
    # operation while the captured window is already verified.
    $global:LASTEXITCODE = 0
  }
}

[ordered]@{
  verified = $true
  packagedIconSha256 = $packagedFingerprint
  installedIconSha256 = $installedFingerprint
  windowIconSha256 = $windowFingerprint
  shortcut = $shortcut
  windowIconMatchesExecutable = $true
} | ConvertTo-Json -Compress
