# 一键启动后端 + 华为侧模拟器，并在浏览器打开健康检查。
# 用法：右键“使用 PowerShell 运行”，或 powershell -ExecutionPolicy Bypass -File preview\start-api.ps1
$ErrorActionPreference = 'Stop'

$preview = $PSScriptRoot
$root = Split-Path $preview -Parent
$server = Join-Path $root 'server'
$bin = Join-Path $server 'bin'
$data = Join-Path $server 'data'
$log = Join-Path $server 'logs'

if (-not (Test-Path (Join-Path $bin 'authd.exe'))) {
  Write-Host '未找到 server\bin\authd.exe，请先执行:' -ForegroundColor Yellow
  Write-Host '  cd server && go build -o bin/authd.exe ./cmd/authd && go build -o bin/hwsim.exe ./cmd/hwsim'
  exit 1
}

New-Item -ItemType Directory -Force -Path $data, $log | Out-Null

$env:ENV = 'development'
$env:SERVER_ADDR = ':8443'
$env:HUAWEI_CLIENT_ID = 'hwsim-client'
$env:HUAWEI_CLIENT_SECRET = '0123456789abcdef'
$env:SESSION_PEPPER = 'pepper-0123456789abcdef'
$env:HUAWEI_OAUTH_BASE_URL = 'http://127.0.0.1:8081'
$env:DATABASE_DSN = (Join-Path $data 'auth.json')
$env:LOG_LEVEL = 'info'

Start-Process -FilePath (Join-Path $bin 'hwsim.exe') `
  -ArgumentList '--addr', ':8081', '--scenario', 'success' `
  -WorkingDirectory $server `
  -RedirectStandardOutput (Join-Path $log 'hwsim.out.log') `
  -RedirectStandardError (Join-Path $log 'hwsim.err.log')

Start-Sleep -Seconds 1

Start-Process -FilePath (Join-Path $bin 'authd.exe') -WorkingDirectory $server `
  -RedirectStandardOutput (Join-Path $log 'authd.out.log') `
  -RedirectStandardError (Join-Path $log 'authd.err.log')

Start-Sleep -Seconds 2

Write-Host ''
Write-Host '服务已启动：' -ForegroundColor Green
Write-Host '  authd   http://127.0.0.1:8443/v1/health'
Write-Host '  hwsim   http://127.0.0.1:8081/hwsim/stats'
Write-Host ''
Write-Host '登录接口示例：' -ForegroundColor Cyan
Write-Host '  curl -X POST http://127.0.0.1:8443/v1/auth/huawei/login -H "Content-Type: application/json" -d "{\"platform\":\"android\",\"authCode\":\"demo\",\"clientVersion\":\"1.0.0\"}"'
Write-Host ''
Write-Host '停止服务：taskkill /F /IM authd.exe /IM hwsim.exe' -ForegroundColor DarkGray

Start-Process 'http://127.0.0.1:8443/v1/health'