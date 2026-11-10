# Ollama 自定义清单后端

## 1. 启动 Ollama

推荐使用 Docker，避免 Windows 直接下载 GitHub 安装包：

```powershell
docker run -d --name checkism-ollama -p 11434:11434 -v checkism-ollama:/root/.ollama ollama/ollama
docker exec checkism-ollama ollama pull qwen2.5:0.5b
```

验证：

```powershell
curl http://127.0.0.1:11434/api/tags
```

## 2. 启动 authd

```powershell
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434'
$env:OLLAMA_MODEL='qwen2.5:0.5b'
$env:OLLAMA_TIMEOUT='60s'
.\server\bin\authd.exe
```

`OLLAMA_MODEL` 可换成更稳的 `qwen2.5:1.5b`；0.5b 更轻，1.5b 生成质量更好。

本地没有模型时，可先开启模板回退保证链路可演示：

```powershell
$env:OLLAMA_FALLBACK='1'
```

## 3. 接口

```http
POST /v1/custom-plans/generate
Authorization: Bearer <sessionToken>
Content-Type: application/json

{"need":"我想用 3 个月准备考研，每天学数学、英语和政治"}
```

返回一级标题、二级技能和成就序列：

```json
{
  "plan": {
    "title": "考研",
    "icon": "📚",
    "description": "三个月备考清单",
    "skills": [
      {
        "name": "数学",
        "icon": "📐",
        "unit": "题",
        "series": [
          {
            "id": "math_main",
            "name": "数学刷题",
            "desc": "完成 {need} 道数学题",
            "icon": "📐",
            "start": 5,
            "end": 100,
            "steps": 6,
            "pointsStart": 20,
            "pointsEnd": 80
          }
        ]
      }
    ]
  }
}
```

客户端会用与英语一致的 `logInterpolate` 生成具体阈值和成就卡片。

## 4. 失败行为

- Ollama 未启动 / 模型不存在：接口返回 `CHECK_008`（503）。
- 模型输出不是合法 JSON：服务端自动重试一次。
- 输出超过 2-4 个二级技能、每个技能超过 1-3 个成就序列：校验失败并重试。
