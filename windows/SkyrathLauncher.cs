// Skyrath for Windows: a small launcher that serves the bundled game from the "game" folder next to this exe
// on a private local port and opens it in its own full-screen app window (Edge or Chrome, no tabs or address bar).
// Saves live in %LOCALAPPDATA%\Skyrath. Build: csc /target:winexe /win32icon:skyrath.ico SkyrathLauncher.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class SkyrathLauncher
{
    const int Port = 47831;                       // fixed, so saved progress is always found again
    static string root;

    [STAThread]
    static void Main()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        root = Path.Combine(exeDir, "game");
        if (!File.Exists(Path.Combine(root, "index.html")))
        {
            MessageBox.Show("The \"game\" folder is missing. Keep Skyrath.exe and the game folder together.", "Skyrath");
            return;
        }

        TcpListener server;
        try { server = new TcpListener(IPAddress.Loopback, Port); server.Start(); }
        catch { MessageBox.Show("Skyrath is already running (or port " + Port + " is busy).", "Skyrath"); return; }
        var t = new Thread(() => Serve(server)) { IsBackground = true };
        t.Start();

        string browser = FindBrowser();
        if (browser == null)
        {
            MessageBox.Show("Microsoft Edge or Google Chrome is needed to run Skyrath.", "Skyrath");
            return;
        }
        string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Skyrath", "app");
        Directory.CreateDirectory(profile);
        string args = "--app=http://localhost:" + Port + "/index.html --start-fullscreen --user-data-dir=\"" + profile + "\"" +
            " --no-first-run --no-default-browser-check --disable-features=Translate --autoplay-policy=no-user-gesture-required" +
            " --ignore-gpu-blocklist --enable-gpu-rasterization --force_high_performance_gpu --enable-zero-copy";
        var p = Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
        p.WaitForExit();
        // Chromium can hand the window to a helper process; keep serving while any app window from our profile is alive
        while (ProfileInUse(profile)) Thread.Sleep(1500);
    }

    static bool ProfileInUse(string profile)
    {
        // Chromium holds a lock file in the profile while a window is open
        string lockFile = Path.Combine(profile, "lockfile");
        if (!File.Exists(lockFile)) return false;
        try { using (File.Open(lockFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { } return false; }
        catch { return true; }
    }

    static string FindBrowser()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] c = {
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (var f in c) if (File.Exists(f)) return f;
        return null;
    }

    static void Serve(TcpListener server)
    {
        while (true)
        {
            TcpClient c;
            try { c = server.AcceptTcpClient(); } catch { return; }
            ThreadPool.QueueUserWorkItem(_ => Handle(c));
        }
    }

    static void Handle(TcpClient client)
    {
        using (client)
        {
            try
            {
                var s = client.GetStream();
                var reader = new StreamReader(s, Encoding.ASCII);
                string line = reader.ReadLine();
                if (line == null) return;
                string range = null, h;
                while (!string.IsNullOrEmpty(h = reader.ReadLine()))
                    if (h.StartsWith("Range:", StringComparison.OrdinalIgnoreCase)) range = h.Substring(6).Trim();
                string[] parts = line.Split(' ');
                string url = parts.Length > 1 ? parts[1] : "/";
                int q = url.IndexOf('?'); if (q >= 0) url = url.Substring(0, q);
                url = Uri.UnescapeDataString(url);
                if (url == "/") url = "/index.html";
                string full = Path.GetFullPath(Path.Combine(root, url.TrimStart('/').Replace('/', '\\')));
                if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    Write(s, "404 Not Found", "text/plain", Encoding.ASCII.GetBytes("not found"), null);
                    return;
                }
                byte[] data = File.ReadAllBytes(full);
                string type = Mime(full);
                if (range != null && range.StartsWith("bytes="))
                {
                    // audio seeking asks for byte ranges
                    string[] r = range.Substring(6).Split('-');
                    long a = r[0] == "" ? 0 : long.Parse(r[0]);
                    long b = (r.Length > 1 && r[1] != "") ? long.Parse(r[1]) : data.Length - 1;
                    if (b >= data.Length) b = data.Length - 1;
                    var part = new byte[b - a + 1];
                    Array.Copy(data, a, part, 0, part.Length);
                    Write(s, "206 Partial Content", type, part, "Content-Range: bytes " + a + "-" + b + "/" + data.Length + "\r\n");
                }
                else Write(s, "200 OK", type, data, null);
            }
            catch { /* client went away */ }
        }
    }

    static void Write(Stream s, string status, string type, byte[] body, string extra)
    {
        string head = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length +
            "\r\nAccept-Ranges: bytes\r\nCache-Control: no-cache\r\nConnection: close\r\n" + (extra ?? "") + "\r\n";
        byte[] hb = Encoding.ASCII.GetBytes(head);
        s.Write(hb, 0, hb.Length);
        s.Write(body, 0, body.Length);
    }

    static string Mime(string f)
    {
        switch (Path.GetExtension(f).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json";
            case ".glb": return "model/gltf-binary";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".mp3": return "audio/mpeg";
            case ".wasm": return "application/wasm";
            default: return "application/octet-stream";
        }
    }
}
