param(
  [string]$Model = "qwen2.5:0.5b",
  [string]$Container = "checkism-ollama",
  [int]$Port = 11434
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "未找到 docker，请先安装 Docker Desktop，或按 docs/ollama.md 安装 Ollama。"
}

$running = docker ps --filter "name=$Container" --format "{{.Names}}"
if (-not $running) {
  $exists = docker ps -a --filter "name=$Container" --format "{{.Names}}"
  if ($exists) {
    docker start $Container | Out-Null
  } else {
    docker run -d --name $Container -p "${Port}:11434" -v "${Container}:/root/.ollama" ollama/ollama | Out-Null
  }
}

Write-Host "等待 Ollama 就绪..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/tags" -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) {
  throw "Ollama 未在 http://127.0.0.1:${Port} 就绪"
}

Write-Host "拉取模型 $Model ..."
docker exec $Container ollama pull $Model

Write-Host "Ollama 已就绪：http://127.0.0.1:${Port}"
Write-Host "authd 环境变量："
Write-Host "  OLLAMA_BASE_URL=http://127.0.0.1:${Port}"
Write-Host "  OLLAMA_MODEL=$Model"
