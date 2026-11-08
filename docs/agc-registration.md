# AGC 真实登记清单（R1–R12）与输入清单（I1–I12）

> 本文件只记录流程与证据位置，**不得写入任何 secret、授权码、令牌或完整用户标识**。
> 复核签字见 `records/agc-registration.md`。

## R1–R12 登记步骤

| 编号 | 步骤 | 控制台位置 | 执行方式 | 产出 | 本地可校验项 | 阻塞影响 |
|---|---|---|---|---|---|---|
| R1 | 注册/登录华为开发者账号并完成实名 | AGC 控制台 | **人工** | 账号可用 | 无 | 全链路 |
| R2 | 创建应用（App） | AGC → 我的应用 → 新建 | **人工** | app_id | `AUTH_APP_ID` 非空 | 全链路 |
| R3 | 配置 Android 包名 `com.checkism.app` | AGC → 项目设置 | **人工** | 包名记录 | `AUTH_ANDROID_PACKAGE_NAME` | Android 授权 |
| R4 | 上传 Android 发布证书 SHA-256 | AGC → 证书指纹 | **人工** | 指纹记录 | `AUTH_ANDROID_RELEASE_CERT_SHA256_DIGEST` 为 64 位 hex | Android 授权 |
| R5 | 配置 iOS Bundle ID 与 Team ID | AGC → iOS 设置 | **人工** | Bundle/Team | `AUTH_IOS_BUNDLE_ID`、`AUTH_IOS_TEAM_ID` | iOS 授权 |
| R6 | 配置 URL Scheme（iOS 回调） | AGC / Xcode | **人工** | Scheme 名称 | 工程 Info.plist 中存在 | iOS 授权 |
| R7 | 开通 Account Kit 能力 | AGC → 能力 → Account Kit | **人工** | 开通状态 + 截图编号 | 无（人工核对） | 全链路 |
| R8 | 获取三端 client_id | AGC → 项目设置 | **人工** | client_id（掩码登记） | 配置项非空 | 服务端换票 |
| R9 | 获取 client_secret | AGC → 项目设置 | **仅密钥通道**：KMS / 只读挂载 / 容器 secret | secret 引用路径（不含值） | 环境变量长度 ≥16 | 服务端换票 |
| R10 | 配置 Windows 回调 `http://127.0.0.1:17890/callback` | AGC → 回调白名单 | **人工** | 白名单记录 | `WINDOWS_REDIRECT_URIS` 精确匹配 | Windows 授权 |
| R11 | 下载 `agconnect-services.json` / `.plist` 并净化 | AGC → 下载配置 | **人工 + 本地脚本** | 配置文件（不含 secret） | `npm run secret:scan` 为 0 | 客户端授权 |
| R12 | 归档登记证据与复核签字 | 本地 | **人工** | `records/agc-registration.md` | 签字位非空 | 验收证据 |

## I1–I12 输入清单

| 编号 | 输入 | 来源 | 是否敏感 | 交付方式 |
|---|---|---|---|---|
| I1 | app_id | AGC | 否 | 配置项 `AUTH_APP_ID` |
| I2 | Android 包名 | 本仓库 | 否 | `AUTH_ANDROID_PACKAGE_NAME` |
| I3 | Android 发布证书 SHA-256 | keystore | 否（摘要） | `AUTH_ANDROID_RELEASE_CERT_SHA256_DIGEST` |
| I4 | iOS Bundle ID | Xcode | 否 | `AUTH_IOS_BUNDLE_ID` |
| I5 | iOS Team ID | Apple | 否 | `AUTH_IOS_TEAM_ID` |
| I6 | client_secret | AGC | **是** | **仅 KMS / 只读挂载 / 容器 secret；禁止邮件、IM、工单附件、仓库、命令行参数** |
| I7 | 旧 client_secret（轮换期） | AGC | **是** | 同 I6，仅密钥通道 |
| I8 | 三端 client_id | AGC | 否 | 环境变量 |
| I9 | Windows 回调地址 | 本系统 | 否 | `WINDOWS_REDIRECT_URIS` |
| I10 | 真实测试账号（≥1，跨端可用） | 业务方 | **是** | 仅记录"已有/缺失"，不写账号标识 |
| I11 | 端点基线复核结论 | 华为官方文档 | 否 | `records/agc-registration.md` |
| I12 | 凭据版本元数据 | 运维 | 否 | `AUTH_CREDENTIAL_VERSION/CHANGED_BY/EFFECTIVE_AT` |

## 登记证据模板

```
登记时间：
操作人：
app_id（掩码，仅末 4 位）：***
三端 client_id（掩码）：android=***  ios=***  windows=***
Android 包名：com.checkism.app
Android 发布证书 SHA-256（摘要前 8 位）：
iOS Bundle ID / Team ID：
Windows 回调：
Account Kit 开通状态：已开通 / 未开通    截图编号：
凭据交付记录（仅通道与时间，不含值）：
复核人 / 日期 / 文档版本号：
声明：本文件不含任何 secret。
```

## 端点复核基线

| 用途 | 官方地址 |
|---|---|
| 换票 | `https://oauth-login.cloud.huawei.com/oauth2/v3/token` |
| JWKS | `https://oauth-login.cloud.huawei.com/oauth2/v3/certs` |
| tokeninfo | `https://oauth-api.cloud.huawei.com/oauth2/v3/tokeninfo` |
| 网页授权 | `https://oauth-login.cloud.huawei.com/oauth2/v3/authorize` |
| iss 白名单 | `https://accounts.huawei.com`、`https://oauth-login.cloud.huawei.com` |

复核签字前，上述值视为**基线值**；未签字时 8.2 / 8.5 / 8.10 的验收结论必须附加"端点常量未签字复核"证据缺口。