# 原生工程构建指南

Android / iOS / Windows 原生工程已按 RN 0.76.9 模板补齐，并接入本项目原生模块。

## Android

工程：`app/android`

已配置：
- `namespace` / `applicationId`：`com.ict.app`
- `minSdkVersion=26`、`compileSdkVersion=35`、`targetSdkVersion=34`
- HMS 仓库：`https://developer.huawei.com/repo/`
- HMS Account Kit 依赖：`com.huawei.hms:hwid:6.13.0.300`
- 原生模块注册：`ICTAppPackage`（`SecureVaultModule` + `HmsAccountModule`）
- AGC 占位：`app/android/app/agconnect-services.json`（不含 secret，需替换为 AGC 下载的真实文件）

构建：

```bash
export JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd app/android
./gradlew assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

### 当前环境阻塞

`gradle-8.11.1-bin.zip` 无法下载（`services.gradle.org`、`downloads.gradle.org`、华为云/腾讯镜像均被网络策略拦截，本机 `.gradle/wrapper/dists` 仅有未完成的 `.part` 文件），因此本机尚不能产出 APK。在可访问 Gradle 发行版与 Maven 仓库的机器上按上述命令即可构建。

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
| Android APK | 工程已补齐，Gradle 下载被阻断，未产出 |
| iOS App | 工程已补齐，需 macOS + Xcode |
| Windows App | 工程已生成，需 VS C++ 负载与 NuGet 网络 |