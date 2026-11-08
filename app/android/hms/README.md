# 华为 Account Kit 原生模块

当前 Android 构建已启用 **真实 Account Kit**：

- 源码：`app/android/app/src/main/java/com/checkism/app/HmsAccountModule.kt`
- 依赖：`com.huawei.hms:hwid:6.12.0.300`（Maven 解析，POM 完整）
- AGC 配置：`app/android/app/agconnect-services.json` 与 `src/main/assets/agconnect-services.json`

## 为什么用 6.12，而不是 6.15

`com.huawei.hms:hwid:6.15.0.300` 的 Maven 仓库只有 AAR、没有 POM；`base` 6.13 AAR 又缺少 `Objects`、`Checker`、`AGCUtils`、`SafeIntent`、`HMSLog`、`IOUtils` 等内部类。手工拼 AAR 后，真机仍会在 `AccountSignInHubActivity` 内触发：

```text
NullPointerException:
  X509Certificate.getPublicKey() on a null object reference
```

`6.12.0.300` 的 POM 完整，会解析：

```text
base 6.12.0.300
ui 6.12.0.300
log 6.12.0.300
stats 6.12.0.300
availableupdate 6.12.0.300
baselegacyapi 6.12.0.300
device 6.12.0.300
com.huawei.hmf:tasks 1.5.2.206
```

因此不再需要手工往 `libs/` 放 AAR。

## 调用方式

Account Kit 6.12 的 `AccountAuthService` 使用：

```text
AccountAuthManager.getService(activity, params)
  → service.signInIntent
  → activity.startActivityForResult(...)
  → AccountAuthManager.parseAuthResultFromIntent(intent)
  → AuthAccount.authorizationCode
```

## AGC 配置

1. Android 包名：`com.checkism.app`
2. 签名 SHA-256（当前 Release 使用 Debug 签名）：
   ```text
   FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
   ```
3. 开通「华为账号」能力。
4. 下载 `agconnect-services.json`，建议勾选「不包含密钥」。
5. 服务端配置：
   ```ini
   HUAWEI_CLIENT_ID=119717995
   HUAWEI_CLIENT_SECRET=你的Client Secret
   AUTH_MODE=real
   ```

## 已验证

- arm64 Release APK 已安装到华为 `PPA-AL20`。
- 点击「华为账号登录」后，前台切换到 `com.huawei.hwid` 的华为账号登录页；授权后客户端日志出现 `authorization code received, length=272`。
- 服务端真实模式返回 `login_success`，手机进入已登录主页（`hid36683688`，云端同步）。
- 取消授权后能正常回到应用并提示「已取消授权，可重新登录」。
- 该页面带安全标记，`adb screencap` 截图为空；`uiautomator dump` 可看到「华为帐号」「下一步」「密码登录」等文本。

## 授权成功后的最后一步

Account Kit 只负责拿到 `authorizationCode`。客户端随后会请求：

```text
POST {PRODUCTION_API_BASE_URL}/v1/auth/huawei/login
```

必须把 `app/src/shared/config.ts` 中的：

```ts
export const PRODUCTION_API_BASE_URL = 'https://api.example.com';
```

改成实际部署的 HTTPS 地址，并确保服务端：

```ini
AUTH_MODE=real
AUTH_ALLOW_MOCK=0
HUAWEI_CLIENT_ID=119717995
HUAWEI_CLIENT_SECRET=你的Client Secret
```

否则会出现“华为授权页正常、授权码已拿到，但回到 App 仍提示登录失败”。这不是 Account Kit 失败，而是后端换票地址或凭据未配置。

真实模式启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-authd-real.ps1
```

脚本会提示输入 Client Secret（不回显），并打印手机可访问的 `/v1/health` 地址。保持窗口不关。

## 注意

- 不要把 Client Secret 写进 APK、`agconnect-services.json` 或 Git。
- 截图/日志里出现过的 Client Secret 建议在 AGC 轮换。
- 真机完成授权后，客户端把 `authorizationCode` 发给 `/v1/auth/huawei/login`，由服务端换票。
