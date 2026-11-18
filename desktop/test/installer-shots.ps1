# Runs one installer the way a person would (pressing Enter on each page) and photographs the screen every few seconds.
# Used only by .github/workflows/installer-preview.yml to show what installing Pivot Mail looks like.
param([string]$Installer, [string]$Name, [string]$Out)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
function Shot($file) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
  $bmp.Save($file, [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$p = Start-Process -FilePath $Installer -PassThru
Start-Sleep -Milliseconds 1500
Shot "$Out\$Name-01.png"
for ($i = 2; $i -le 10; $i++) {
  $win = Get-Process | Where-Object { $_.MainWindowTitle -like '*Pivot Mail*' } | Select-Object -First 1
  if ($win) { [W]::SetForegroundWindow($win.MainWindowHandle) | Out-Null; Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
  Start-Sleep -Milliseconds 2500
  Shot ("$Out\$Name-{0:D2}.png" -f $i)
}
# Leave the machine clean for the next variant: close the app, remove what was installed.
Get-Process | Where-Object { $_.ProcessName -like 'Pivot Mail*' -or $_.ProcessName -like 'PivotMail*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$un = Join-Path $env:LOCALAPPDATA 'Programs\pivot-mail-desktop\Uninstall Pivot Mail.exe'
if (Test-Path $un) { Start-Process -FilePath $un -ArgumentList '/S' -Wait }
Start-Sleep -Seconds 2
