using System.Windows;

namespace PivotMailSetup
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            // IT can install without any window: PivotMail-Setup.exe /silent  (same choices as the defaults: start with Windows,
            // desktop shortcut; Pivot Mail is not opened). Exit code 0 means installed.
            foreach (var a in e.Args)
            {
                var arg = a.ToLowerInvariant();
                if (arg == "/silent" || arg == "--silent" || arg == "/s")
                {
                    ShutdownMode = ShutdownMode.OnExplicitShutdown;
                    if (Installer.Unsupported() != null)
                    {
                        Shutdown(2); // this Windows cannot run Pivot Mail
                        return;
                    }
                    // On a worker thread: waiting here on the window thread itself would never finish.
                    var r = System.Threading.Tasks.Task.Run(() => Installer.InstallAsync(null)).GetAwaiter().GetResult();
                    if (r.Ok) Installer.Apply(runNow: false, startup: true, desktop: true);
                    // No window to show the reason in: it goes to %TEMP%\PivotMailSetup.log for IT.
                    try
                    {
                        System.IO.File.AppendAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "PivotMailSetup.log"),
                            System.DateTime.Now.ToString("s") + "  " + (r.Ok ? "installed" : "failed: " + r.Message) + System.Environment.NewLine);
                    }
                    catch { /* nowhere to write */ }
                    Shutdown(r.Ok ? 0 : 1);
                    return;
                }
            }
            base.OnStartup(e);
            MainWindow = new MainWindow();
            MainWindow.Show();
        }
    }
}
