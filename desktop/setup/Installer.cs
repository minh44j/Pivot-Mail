using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace PivotMailSetup
{
    /// <summary>
    /// The work behind the window: unpack the real installer (electron-builder's NSIS package, carried inside this exe), run it
    /// silently for the signed-in person only, report progress from the files it writes, then apply the person's choices.
    /// </summary>
    public static class Installer
    {
        public sealed class Result
        {
            public bool Ok;
            public string Message;
        }

        /// <summary>Where electron-builder installs a per-person app: %LOCALAPPDATA%\Programs\&lt;package name&gt;.</summary>
        public static string InstallDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "pivot-mail-desktop");
        public static string AppExe => Path.Combine(InstallDir, "Pivot Mail.exe");
        /// <summary>The app's own settings file (Electron userData: %APPDATA%\Pivot Mail).</summary>
        static string SettingsFile => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pivot Mail", "settings.json");
        /// <summary>Must match the app's AppUserModelId: Electron's "Start with Windows" uses it as the registry value name.</summary>
        const string RunValue = "com.pivot.mail";

        /// <summary>
        /// Pivot Mail runs on 64-bit Windows 10 and 11 (Intel/AMD, and Windows 11 on ARM through its built-in x64 emulation).
        /// Returns why this computer cannot run it, or null when it can.
        /// </summary>
        public static string Unsupported()
        {
            var v = Environment.OSVersion.Version; // true version: app.manifest declares Windows 10/11 support
            if (v.Major < 10) return "Pivot Mail needs Windows 10 or Windows 11. This computer has an older Windows, which no longer receives security updates. Please ask IT to update it.";
            if (!Environment.Is64BitOperatingSystem) return "Pivot Mail needs the 64-bit edition of Windows 10 or 11. This computer has the 32-bit edition. Please ask IT.";
            var arch = (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432") ?? Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "").ToUpperInvariant();
            if (arch == "ARM64" && v.Build < 22000) return "On computers with an ARM processor, Pivot Mail needs Windows 11 (Windows 10 on ARM cannot run it). Please ask IT.";
            return null;
        }

        public static async Task<Result> InstallAsync(Action<double, string> progress)
        {
            var tmp = Path.Combine(Path.GetTempPath(), "PivotMailSetup-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(tmp);
                var payload = Path.Combine(tmp, "PivotMail-Package.exe");
                var asm = Assembly.GetExecutingAssembly();
                long expected = ReadExpectedBytes(asm);
                int exitCode;

                // 1. unpack the package (0-8 %)
                progress?.Invoke(0.01, "Preparing the files…");
                using (var src = asm.GetManifestResourceStream("Payload"))
                {
                    if (src == null) return new Result { Message = "This setup file is incomplete. Download it again." };
                    using (var dst = File.Create(payload))
                    {
                        var buf = new byte[1 << 20];
                        long total = src.Length, done = 0;
                        int n;
                        while ((n = await src.ReadAsync(buf, 0, buf.Length)) > 0)
                        {
                            await dst.WriteAsync(buf, 0, n);
                            done += n;
                            progress?.Invoke(0.08 * done / Math.Max(1, total), "Preparing the files…");
                        }
                    }
                }

                // 2. a running Pivot Mail (an update) is closed first, so its files can be replaced
                CloseRunningApp();

                // 3. install silently, for this person only (8-98 %). Progress comes from the files the package writes (watched as
                //    they are written: the package keeps each file's original date, so dates cannot tell new from old), with a
                //    gentle time-based estimate underneath so the bar always moves.
                progress?.Invoke(0.08, "Copying Pivot Mail to this computer…");
                Directory.CreateDirectory(InstallDir);
                var seen = new ConcurrentDictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                using (var watch = new FileSystemWatcher(InstallDir) { IncludeSubdirectories = true, InternalBufferSize = 64 * 1024, NotifyFilter = NotifyFilters.FileName | NotifyFilters.Size | NotifyFilters.LastWrite })
                {
                    FileSystemEventHandler mark = (o, ev) => seen[ev.FullPath] = true;
                    watch.Created += mark;
                    watch.Changed += mark;
                    watch.EnableRaisingEvents = true;
                    var clock = Stopwatch.StartNew();
                    var p = Process.Start(new ProcessStartInfo(payload, "/S") { UseShellExecute = false, CreateNoWindow = true });
                    if (p == null) return new Result { Message = "Windows did not start the installation." };
                    while (!p.HasExited)
                    {
                        await Task.Delay(200);
                        long written = 0;
                        foreach (var path in seen.Keys)
                        {
                            try { var fi = new FileInfo(path); if (fi.Exists) written += fi.Length; } catch { /* moved or locked */ }
                        }
                        var byFiles = expected > 0 ? Math.Min(1.0, (double)written / expected) : 0;
                        var byTime = 0.9 * (1 - Math.Exp(-clock.Elapsed.TotalSeconds / 14.0));
                        var f = Math.Max(byFiles, byTime);
                        progress?.Invoke(0.08 + 0.9 * f, f > 0.85 ? "Setting things up…" : "Copying Pivot Mail to this computer…");
                    }
                    p.WaitForExit();
                    exitCode = p.ExitCode;
                }
                if (exitCode != 0 || !File.Exists(AppExe))
                    return new Result { Message = $"The installer stopped with code {exitCode}. Please try again; if it happens again, tell IT this code." };
                progress?.Invoke(1.0, "Done");
                return new Result { Ok = true };
            }
            catch (Exception ex)
            {
                return new Result { Message = "Something stopped the installation: " + ex.Message };
            }
            finally
            {
                try { Directory.Delete(tmp, true); } catch { /* removed by Windows later */ }
            }
        }

        /// <summary>The person's three choices on the last screen.</summary>
        public static void Apply(bool runNow, bool startup, bool desktop)
        {
            // Start with Windows: the same registry entry and setting the app's own tray switch uses, so both always agree.
            using (var run = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (startup) run?.SetValue(RunValue, "\"" + AppExe + "\" --hidden");
                else if (run?.GetValue(RunValue) != null) run.DeleteValue(RunValue, false);
            }
            WriteStartupSetting(startup);

            // Desktop shortcut
            var lnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Pivot Mail.lnk");
            if (desktop) CreateShortcut(lnk);
            else if (File.Exists(lnk)) File.Delete(lnk);

            if (runNow) Process.Start(new ProcessStartInfo(AppExe) { UseShellExecute = true, WorkingDirectory = InstallDir });
        }

        static long ReadExpectedBytes(Assembly asm)
        {
            using (var s = asm.GetManifestResourceStream("ExpectedBytes"))
            {
                if (s == null) return 0;
                using (var r = new StreamReader(s)) return long.TryParse(r.ReadToEnd().Trim(), out var v) ? v : 0;
            }
        }

        static void CloseRunningApp()
        {
            foreach (var p in Process.GetProcessesByName("Pivot Mail"))
            {
                try
                {
                    p.CloseMainWindow();
                    if (!p.WaitForExit(3000)) p.Kill();
                }
                catch { /* already gone */ }
            }
        }

        static void CreateShortcut(string path)
        {
            var t = Type.GetTypeFromProgID("WScript.Shell");
            if (t == null) return;
            dynamic shell = Activator.CreateInstance(t);
            dynamic s = shell.CreateShortcut(path);
            s.TargetPath = AppExe;
            s.WorkingDirectory = InstallDir;
            s.IconLocation = AppExe + ",0";
            s.Description = "Pivot Mail";
            s.Save();
        }

        /// <summary>Records the choice in the app's settings (startWithWindows), keeping everything else in that file as it is.</summary>
        static void WriteStartupSetting(bool on)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile));
            var json = File.Exists(SettingsFile) ? File.ReadAllText(SettingsFile) : "{}";
            var value = on ? "true" : "false";
            var re = new Regex("\"startWithWindows\"\\s*:\\s*(true|false)");
            if (re.IsMatch(json)) json = re.Replace(json, "\"startWithWindows\": " + value);
            else
            {
                var i = json.IndexOf('{');
                if (i < 0) json = "{}";
                i = json.IndexOf('{');
                var empty = json.Substring(i + 1).Trim().StartsWith("}");
                json = json.Insert(i + 1, "\n  \"startWithWindows\": " + value + (empty ? "\n" : ","));
            }
            File.WriteAllText(SettingsFile, json);
        }
    }
}
