# Start authd in real mode (Huawei Account Kit code exchange).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-authd-real.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "server")

if (-not $env:HUAWEI_CLIENT_ID) {
  $env:HUAWEI_CLIENT_ID = "119717995"
}

if (-not $env:HUAWEI_CLIENT_SECRET) {
  $secure = Read-Host "Paste AGC Client Secret (hidden, long string, NOT Client ID)" -AsSecureString
  $env:HUAWEI_CLIENT_SECRET = [System.Net.NetworkCredential]::new("", $secure).Password
}

if ($env:HUAWEI_CLIENT_SECRET.Length -lt 32) {
  throw "Client Secret is too short ($($env:HUAWEI_CLIENT_SECRET.Length) chars). Copy the long Client Secret from AGC, not the 9-digit Client ID."
}

if (-not $env:SESSION_PEPPER) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:SESSION_PEPPER = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

$env:AUTH_MODE = "real"
$env:AUTH_ALLOW_MOCK = "0"
$env:SERVER_ADDR = ":8443"

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like '192.168.137.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
  $ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

Write-Host ""
Write-Host "authd real mode starting..."
if ($ip) {
  Write-Host "Health check: http://${ip}:8443/v1/health"
}
Write-Host "Phone must be able to open this URL. Allow port 8443 in Windows Firewall if needed."
Write-Host "Keep this window open."
Write-Host ""

& (Join-Path $root "server\bin\authd.exe")
