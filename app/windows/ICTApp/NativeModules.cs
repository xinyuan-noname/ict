using System;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.ReactNative.Managed;

namespace ICTApp
{
    /// <summary>
    /// Windows 端回环授权：系统浏览器 + 127.0.0.1:17890 回调。
    /// state 仅内存持有、一次性校验；超时 120s。
    /// 未构建验证：本机无 VS C++ 负载 / Windows SDK。
    /// </summary>
    [ReactModule("LoopbackOAuthModule")]
    public sealed class LoopbackOAuthModule
    {
        private bool _busy;

        [ReactMethod("canBindLoopback")]
        public Task<bool> CanBindLoopback()
        {
            try
            {
                var listener = new HttpListener();
                listener.Prefixes.Add("http://127.0.0.1:17890/");
                listener.Start();
                listener.Stop();
                return Task.FromResult(true);
            }
            catch
            {
                return Task.FromResult(false);
            }
        }

        [ReactMethod("startOAuth")]
        public async Task<object> StartOAuth(string authorizeUrl, string redirectUri, double timeoutMs)
        {
            if (_busy)
            {
                return new { error = "another authorization is in progress" };
            }
            _busy = true;
            var state = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace("+", "-").Replace("/", "_").TrimEnd('=');
            var listener = new HttpListener();
            listener.Prefixes.Add("http://127.0.0.1:17890/");
            try
            {
                listener.Start();
                var url = $"{authorizeUrl}?response_type=code&client_id={Uri.EscapeDataString("CLIENT_ID")}&redirect_uri={Uri.EscapeDataString(redirectUri)}&scope=openid%20profile&state={state}";
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

                var acceptTask = listener.GetContextAsync();
                var completed = await Task.WhenAny(acceptTask, Task.Delay(TimeSpan.FromMilliseconds(timeoutMs)));
                if (completed != acceptTask)
                {
                    return new { cancelled = true };
                }

                var ctx = acceptTask.Result;
                var query = ctx.Request.QueryString;
                var receivedState = query["state"] ?? string.Empty;
                var code = query["code"] ?? string.Empty;

                if (!CryptographicOperations.FixedTimeEquals(
                        Encoding.UTF8.GetBytes(receivedState), Encoding.UTF8.GetBytes(state)) || code.Length == 0)
                {
                    await WriteHtml(ctx, "授权校验失败，请重试");
                    return new { error = "state mismatch" };
                }

                await WriteHtml(ctx, "授权完成，可关闭此页面");
                return new { code };
            }
            catch (Exception ex)
            {
                return new { error = ex.Message };
            }
            finally
            {
                _busy = false;
                try { listener.Stop(); } catch { /* ignore */ }
            }
        }

        private static async Task WriteHtml(HttpListenerContext ctx, string message)
        {
            var body = Encoding.UTF8.GetBytes($"<html><body><h3>{message}</h3></body></html>");
            ctx.Response.ContentType = "text/html; charset=utf-8";
            ctx.Response.ContentLength64 = body.Length;
            await ctx.Response.OutputStream.WriteAsync(body, 0, body.Length);
            ctx.Response.Close();
        }
    }

    /// <summary>Windows 安全存储：DPAPI 加密后落盘到应用私有目录。</summary>
    [ReactModule("SecureVaultModule")]
    public sealed class SecureVaultModule
    {
        [DllImport("crypt32.dll", SetLastError = true)]
        private static extern bool CryptProtectData(ref DATA_BLOB pDataIn, string szDataDescr, ref DATA_BLOB pOptionalEntropy, IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, ref DATA_BLOB pDataOut);

        [DllImport("crypt32.dll", SetLastError = true)]
        private static extern bool CryptUnprotectData(ref DATA_BLOB pDataIn, IntPtr ppszDataDescr, ref DATA_BLOB pOptionalEntropy, IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, ref DATA_BLOB pDataOut);

        [StructLayout(LayoutKind.Sequential)]
        private struct DATA_BLOB
        {
            public int cbData;
            public IntPtr pbData;
        }

        private static string PathFor(string key) =>
            System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ict", key + ".bin");

        [ReactMethod("set")]
        public Task Set(string key, string value)
        {
            var dir = System.IO.Path.GetDirectoryName(PathFor(key));
            System.IO.Directory.CreateDirectory(dir);
            var raw = Encoding.UTF8.GetBytes(value);
            var protectedBytes = Protect(raw);
            System.IO.File.WriteAllBytes(PathFor(key), protectedBytes);
            return Task.CompletedTask;
        }

        [ReactMethod("get")]
        public Task<string> Get(string key)
        {
            var path = PathFor(key);
            if (!System.IO.File.Exists(path)) return Task.FromResult<string>(null);
            var bytes = System.IO.File.ReadAllBytes(path);
            return Task.FromResult(Encoding.UTF8.GetString(Unprotect(bytes)));
        }

        [ReactMethod("clear")]
        public Task Clear(string key)
        {
            var path = PathFor(key);
            if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
            return Task.CompletedTask;
        }

        private static byte[] Protect(byte[] data)
        {
            var inBlob = new DATA_BLOB { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
            Marshal.Copy(data, 0, inBlob.pbData, data.Length);
            var outBlob = new DATA_BLOB();
            var entropy = new DATA_BLOB();
            try
            {
                if (!CryptProtectData(ref inBlob, "ict", ref entropy, IntPtr.Zero, IntPtr.Zero, 0, ref outBlob))
                    throw new CryptographicException("CryptProtectData failed");
                var result = new byte[outBlob.cbData];
                Marshal.Copy(outBlob.pbData, result, 0, outBlob.cbData);
                return result;
            }
            finally
            {
                Marshal.FreeHGlobal(inBlob.pbData);
            }
        }

        private static byte[] Unprotect(byte[] data)
        {
            var inBlob = new DATA_BLOB { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
            Marshal.Copy(data, 0, inBlob.pbData, data.Length);
            var outBlob = new DATA_BLOB();
            var entropy = new DATA_BLOB();
            try
            {
                if (!CryptUnprotectData(ref inBlob, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 0, ref outBlob))
                    throw new CryptographicException("CryptUnprotectData failed");
                var result = new byte[outBlob.cbData];
                Marshal.Copy(outBlob.pbData, result, 0, outBlob.cbData);
                return result;
            }
            finally
            {
                Marshal.FreeHGlobal(inBlob.pbData);
            }
        }
    }
}