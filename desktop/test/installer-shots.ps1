# Runs Pivot Mail Setup the way a person would (Enter = the highlighted button) and photographs each screen.
# Used only by .github/workflows/installer-preview.yml to show what installing Pivot Mail looks like.
param([string]$Installer, [string]$Out)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
function Shot($name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $Out "$name.png"), [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Press($title) {
  $w = Get-Process | Where-Object { $_.MainWindowTitle -eq $title } | Select-Object -First 1
  if ($w) { [W]::SetForegroundWindow($w.MainWindowHandle) | Out-Null; Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$p = Start-Process -FilePath $Installer -PassThru
Start-Sleep -Seconds 3
Shot '1-welcome'
Press 'Pivot Mail Setup'
# photograph the progress until Pivot Mail is installed (at most a minute), then the ready screen
$exe = Join-Path $env:LOCALAPPDATA 'Programs\pivot-mail-desktop\Pivot Mail.exe'
$i = 0
do { Start-Sleep -Milliseconds 1200; $i++; Shot ("2-installing-{0:D2}" -f $i) } while (((Get-Process 'PivotMail-Package' -ErrorAction SilentlyContinue) -or $i -lt 3) -and $i -lt 50)
Start-Sleep -Seconds 4
Shot '3-ready'
Press 'Pivot Mail Setup'
Start-Sleep -Seconds 8
Shot '4-pivot-mail-opens'
# leave the machine clean
Get-Process | Where-Object { $_.ProcessName -like 'Pivot Mail*' } | Stop-Process -Force -ErrorAction SilentlyContinue
$un = Join-Path $env:LOCALAPPDATA 'Programs\pivot-mail-desktop\Uninstall Pivot Mail.exe'
if (Test-Path $un) { Start-Process -FilePath $un -ArgumentList '/S' -Wait }
