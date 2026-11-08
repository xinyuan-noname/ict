# 原生工程构建指南

Android / iOS / Windows 原生工程已按 RN 0.76.9 模板补齐，并接入本项目原生模块。

## Android

工程：`app/android`

已配置：

- `namespace` / `applicationId`：`com.checkism.app`
- `minSdkVersion=26`、`compileSdkVersion=35`、`targetSdkVersion=34`
- `ndkVersion=26.1.10909125`
- 原生模块注册：`ICTAppPackage`（`SecureVaultModule` + `HmsAccountModule`）
- Account Kit：真实模块已启用（`app/android/app/src/main/java/com/checkism/app/HmsAccountModule.kt`），依赖 `com.huawei.hms:hwid:6.12.0.300`

### 环境

本机已验证可用的组合：

| 项 | 值 |
|---|---|
| JDK | 17（`%LOCALAPPDATA%\Programs\Microsoft\jdk-17.0.10.7-hotspot`） |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` |
| Build Tools | 35.0.0（Gradle 会自动补 34.0.0） |
| NDK | 26.1.10909125 |
| Gradle | 8.10.2（wrapper 已缓存） |
| 模拟器 | `check_api35`（Android 15 / x86_64） |
| 真机 | 华为 PPA-AL20（`6VPYD21608214977`） |

> **重要：项目路径不要含中文。**
> 当前仓库位于 `D:\project\华为ICT\ict`，AGP 可以加 `android.overridePathCheck=true` 绕过检查，但 CMake/Ninja 仍会在 `.cxx` 路径把中文变成乱码并报：
> `ninja: fatal: chdir to ... No such file or directory`。
> 因此 Android 原生构建必须从纯 ASCII 路径执行。仓库内已保留 `android.overridePathCheck=true` 仅用于临时排查，不解决 Ninja 路径问题。

### 从 ASCII 路径构建（推荐）

```powershell
# 1. 复制到纯 ASCII 构建目录（保留原仓库）
robocopy "D:\project\华为ICT\ict" "D:\ict_build" /E `
  /XD "D:\project\华为ICT\ict\.git" `
      "D:\project\华为ICT\ict\.dev" `
      "D:\project\华为ICT\ict\.tmp" `
      "D:\project\华为ICT\ict\.tools" `
      "D:\project\华为ICT\ict\app\node_modules" `
      "D:\project\华为ICT\ict\app\android\.gradle" `
      "D:\project\华为ICT\ict\app\android\app\build"

# 2. 复制依赖（不要用 junction：Metro 可能无法遍历，导致 @babel/runtime 解析失败）
robocopy "D:\project\华为ICT\ict\app\node_modules" "D:\ict_build\app\node_modules" /E

# 3. 环境变量
$env:JAVA_HOME="$env:LOCALAPPDATA\Programs\Microsoft\jdk-17.0.10.7-hotspot"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

# 4. 构建（x86_64 模拟器 / arm64-v8a 真机二选一）
cd D:\ict_build\app\android
.\gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon `
  -I ..\..\.dev\mirror.init.gradle
# 真机：
# .\gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon `
#   -I ..\..\.dev\mirror.init.gradle
# 独立安装包（内嵌 JS，不需要 Metro）：
# .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon `
#   -I ..\..\.dev\mirror.init.gradle

# 5. 安装与启动 Metro
adb -s emulator-5554 install -r .\app\build\outputs\apk\debug\app-debug.apk
adb -s emulator-5554 reverse tcp:8081 tcp:8081
cd D:\ict_build\app
npx react-native start --host 0.0.0.0 --port 8081
adb -s emulator-5554 shell am start -n com.checkism.app/.MainActivity
```

产物：

- Debug：`app/android/app/build/outputs/apk/debug/app-debug.apk`（需 Metro）
- Release：`app/android/app/build/outputs/apk/release/app-release.apk`（内嵌 JS，约 16 MB，Standalone）

### 已修复的构建问题

1. **Gradle 需要 JDK 17**
   RN 0.76 的 Gradle 插件 `jvmToolchain(17)`；JDK 24 会报 “Cannot find a Java installation matching 17”。
2. **Maven Central 大 AAR 超时**
   `react-android-0.76.9-debug.aar` 206 MB、`hermes-android` 97 MB。已通过华为云/阿里云镜像 + 本地 Maven 缓存解决；`.dev/mirror.init.gradle` 是本机强制镜像脚本，不进入产品代码。
3. **Android 35 platform 缺 `android.jar`**
   本机 SDK 的 `platforms/android-35` 只有资源没有 jar，已用 Google 官方 `platform-35_r02.zip` 补齐。
4. **HMS Account Kit 依赖版本选择**
   `com.huawei.hms:hwid:6.15.0.300` 没有 POM，手工拼 AAR 会缺 `Objects`、`Checker`、`AGCUtils`、`SafeIntent`、`HMSLog`、`IOUtils` 等内部类，并在真机 `AccountSignInHubActivity` 内触发 `X509CertUtil` NPE。
   改用 **`com.huawei.hms:hwid:6.12.0.300`**：该版本 POM 完整，会解析 `base`、`ui`、`log`、`stats`、`availableupdate`、`baselegacyapi`、`device` 和 `hmf:tasks`，不再需要手工补类。Account Kit 6.12 同样使用 `signInIntent + startActivityForResult`。
5. **Metro 无法解析 `contracts/`**
   `rewardsStore.ts` 引用 `../../../contracts/generated/ts/reward-catalog`，位于 app 上一级。已在 `app/metro.config.js` 增加：
   - `watchFolders: [path.resolve(__dirname, '..')]`
   - `nodeModulesPaths` 包含 app 与仓库根
6. **中文路径导致 Ninja 失败**
   必须从 ASCII 路径构建，见上文。
7. **模拟器连不上 Metro**
   Metro 默认只监听 `127.0.0.1`，模拟器通过 `10.0.2.2` 访问时会失败。使用 `--host 0.0.0.0`，并执行 `adb reverse tcp:8081 tcp:8081`。

### 当前验证结果

- x86_64 APK 已成功安装到 `emulator-5554`（Android 15），游客主页、洞察、运动成就 nav 栏、我的、系统与云端均可正常操作。
- 首页记录 250 ml 后出现“已记录 250 ml”，今日记录变为 1 条。
- arm64-v8a APK 已成功构建并安装到华为 `PPA-AL20`（`6VPYD21608214977`）。
- arm64-v8a Release APK（约 16.8 MB，内嵌 JS）已安装到同一台华为手机；无需 Metro 即可启动。
- Account Kit 真实模块已接入；华为 PPA-AL20 真机点击「华为账号登录」已拉起华为账号登录页，授权后客户端日志出现 `authorization code received, length=272`，服务端返回 `login_success`，手机进入已登录主页（`hid36683688`）。该页面带安全标记，`adb screencap` 截图为空，可用 `uiautomator dump` 查看页面文本。

### 华为登录联调的最后一步

Account Kit 只负责返回 `authorizationCode`，随后客户端会请求：

```text
POST {PRODUCTION_API_BASE_URL}/v1/auth/huawei/login
```

当前生产地址还是占位值（`app/src/shared/config.ts` 中的 `PRODUCTION_API_BASE_URL`）：

```text
https://api.example.com
```

必须改成实际部署的 HTTPS 地址，并在服务端配置：

```ini
AUTH_MODE=real
AUTH_ALLOW_MOCK=0
HUAWEI_CLIENT_ID=119717995
HUAWEI_CLIENT_SECRET=你的Client Secret
SESSION_PEPPER=至少32字节随机值
```

否则会出现：华为授权页正常、授权码已拿到，但回到 App 后仍提示登录失败。这是后端地址/换票配置问题，不是 Account Kit 授权失败。

真实模式可以这样启动（会提示输入 Client Secret，不会回显）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-authd-real.ps1
```

保持窗口不关，手机浏览器先打开脚本打印的 `http://<局域网IP>:8443/v1/health`，确认能返回 `ok`。

当前调试 APK 的局域网地址写在 `app/src/shared/config.ts`：

```ts
export const DEV_ANDROID_API_BASE_URL = 'http://192.168.137.1:8443';
```

如果电脑 IP 变化，改这一行并重新构建 Debug APK。Release 仍然使用 `PRODUCTION_API_BASE_URL`，不能用局域网 HTTP。

## iOS

工程：`app/ios/ICTApp.xcodeproj`（已由 HelloWorld 重命名）

已配置：
- Podfile：`pod 'HMSAccount', '~> 7.0'`
- `SecureVault.swift` 位于 `app/ios/ICTApp/`，**需在 Xcode 中拖入 ICTApp target**（Compile Sources）
- AGC：从 AGC 控制台下载 `agconnect-services.plist` 加入工程

构建（需 macOS）：

```bash
cd app/ios && pod install
open ICTApp.xcworkspace
```

## Windows

工程：`app/windows`（由 `react-native-windows@0.76.17` 的 `cpp-app` 模板生成，工程名 `IctApp`，应用显示名/组件名 `ICTApp`）。

注意：RNW 0.76 只提供 `cpp-app` / `cpp-lib` 模板，**不提供 C# 应用模板**。因此 `app/windows/ICTApp/NativeModules.cs`（回环授权 + DPAPI）目前是参考实现，未纳入 C++ 工程编译；如需在本机启用，需改写为 C++/WinRT 模块并登记到 `IctApp.vcxproj`。

依赖：Visual Studio 2022 + “使用 C++ 的桌面开发”负载 + Windows SDK 10.0.19041+。

```bash
cd app
npx react-native run-windows
```

当前本机未检出 VS C++ 桌面负载（`Program Files\Microsoft Visual Studio\2022` 下只有 `18`，无 `VC\Tools\MSVC`），且 NuGet 还原需外网，未执行构建。

## 与本机环境的对应关系

| 目标 | 状态 |
|---|---|
| 服务端 Windows 可执行文件 | 已构建：`server/bin/authd.exe`、`hwsim.exe` |
| Android APK（x86_64） | 已构建并安装到模拟器，游客流程可操作 |
| Android APK（arm64-v8a Debug） | 已构建并安装到华为 PPA-AL20 |
| Android APK（arm64-v8a Release） | 已构建（约 16.8 MB，内嵌 JS）并安装到华为 PPA-AL20；华为账号登录页已拉起 |
| iOS App | 工程已补齐，需 macOS + Xcode |
| Windows App | 工程已生成，需 VS C++ 负载与 NuGet 网络 |
