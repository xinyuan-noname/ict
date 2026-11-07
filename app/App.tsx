import React, { useEffect, useMemo, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { AuthApi } from './src/api/authApi';
import { ApiClient } from './src/api/client';
import { AppRoot } from './src/app/AppRoot';
import { AuthProvider } from './src/auth/AuthProvider';
import { NativeAccountKitProvider } from './src/auth/providers/nativeAccountKit';
import { WebOAuthProvider, WindowsCapabilityProbe } from './src/auth/providers/webOAuth';
import { WebUnsupportedProvider } from './src/auth/providers/webUnsupported';
import { AppDialogHost } from './src/components/AppDialog';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import type { AuthProviderStrategy, CapabilityProbe } from './src/auth/providers/types';
import { RewardsApi } from './src/api/rewardsApi';
import { CheckApi } from './src/api/checkApi';
import { CheckStore } from './src/check/checkStore';
import { SportApi } from './src/api/sportApi';
import { SportStore } from './src/sport/sportStore';
import { SyncClient } from './src/api/syncClient';
import { SyncEngine } from './src/sync/syncEngine';
import { SyncQueue } from './src/sync/syncQueue';
import { RewardsStore } from './src/rewards/rewardsStore';
import { GuestNetworkGuard } from './src/guest/GuestNetworkGuard';
import { GuestStore } from './src/guest/GuestStore';
import { AsyncStorageGuestStorage } from './src/guest/GuestStorage';
import { KeychainVault } from './src/native/SecureVault';
import { APP_VERSION, WINDOWS_REDIRECT_URI, defaultBaseUrl } from './src/shared/config';
import { WeChatAuthApi, weChatOrigin } from './src/api/wechatAuthApi';
import { takePendingWeChatCallback } from './src/web/wechatCallback';

export interface AppDependencies {
  baseUrl?: string;
  authorizeUrl?: string;
  provider?: AuthProviderStrategy;
  capability?: CapabilityProbe;
  guard?: GuestNetworkGuard;
  resumeGuestOnBoot?: boolean;
  wechatApi?: WeChatAuthApi;
}

// 微信仅 Web：同源请求；仅本地回环允许 http（生产必须 https）。
function createWeChatApi(): WeChatAuthApi | undefined {
  if (Platform.OS !== 'web') {
    return undefined;
  }
  const origin = weChatOrigin();
  if (!origin) {
    return undefined;
  }
  const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return new WeChatAuthApi(
    new ApiClient({ baseUrl: origin, allowInsecure: __DEV__ || localOrigin })
  );
}

export function buildAuthProvider(deps: AppDependencies = {}): AuthProvider {
  const client = new ApiClient({
    baseUrl: deps.baseUrl ?? defaultBaseUrl(),
    allowInsecure: __DEV__,
    guard: deps.guard
  });
  const api = new AuthApi(client);
  const isWeb = Platform.OS === 'web';
  const isWindows = Platform.OS === 'windows' || process.env.RN_PLATFORM === 'windows';
  // 微信仅 Web：同源请求，不读 defaultBaseUrl（P5）。三端不构造该 API。
  const wechatApi = deps.wechatApi ?? createWeChatApi();
  const strategy =
    deps.provider ??
    (isWeb
      ? new WebUnsupportedProvider()
      : isWindows
        ? new WebOAuthProvider({
            authorizeUrl: deps.authorizeUrl ?? 'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize',
            redirectUri: WINDOWS_REDIRECT_URI
          })
        : new NativeAccountKitProvider());
  return new AuthProvider({
    api,
    vault: new KeychainVault(),
    provider: strategy,
    capability: deps.capability ?? (isWindows ? new WindowsCapabilityProbe() : undefined),
    clientVersion: APP_VERSION,
    guestStore: new GuestStore({ storage: new AsyncStorageGuestStorage() }),
    networkGuard: deps.guard,
    // Web 首屏固定为登录页：不自动恢复游客档案，点击「游客进入预览」时才复用。
    resumeGuestOnBoot: deps.resumeGuestOnBoot ?? !isWeb,
    wechatApi
  });
}

// 依赖构造放在 AppContent 内：异常会落在 ErrorBoundary 之内，避免整棵树被卸载成白屏。
export default function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.root}>
      <ErrorBoundary>
        <AppContent />
        <AppDialogHost />
      </ErrorBoundary>
    </SafeAreaView>
  );
}

function AppContent(): React.JSX.Element {
  const guard = useMemo(() => new GuestNetworkGuard(), []);
  // 微信仅在 Web 构造，且使用同源 baseUrl；三端为 undefined。
  const wechatApi = useMemo(() => createWeChatApi(), []);
  const provider = useMemo(() => buildAuthProvider({ guard, wechatApi }), [guard, wechatApi]);
  const initialWeChatCallback = useMemo(
    () => (Platform.OS === 'web' ? takePendingWeChatCallback() : null),
    []
  );
  const [wechatState, setWechatState] = useState<{ available: boolean; reason?: string }>({
    available: false
  });

  // 渲染前完成可用性判定（≤1s）；失败/超时按不可用降级，不阻塞游客入口。
  useEffect(() => {
    if (!wechatApi) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setWechatState({ available: false, reason: 'unavailable' });
      }
    }, 1000);
    void wechatApi
      .availability()
      .then(({ data }) => {
        if (cancelled) return;
        clearTimeout(timer);
        setWechatState({ available: data.enabled, reason: data.reason });
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timer);
        setWechatState({ available: false, reason: 'unavailable' });
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wechatApi]);
  const rewardsStore = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new RewardsStore({ api: new RewardsApi(client), getToken: () => provider.currentToken() });
  }, [provider, guard]);
  const checkStore = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new CheckStore({ api: new CheckApi(client), getToken: () => provider.currentToken() });
  }, [provider, guard]);
  const sportStore = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new SportStore({ api: new SportApi(client), getToken: () => provider.currentToken() });
  }, [provider, guard]);
  const syncEngine = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new SyncEngine({
      client: new SyncClient(client),
      queue: new SyncQueue(),
      getToken: () => provider.currentToken(),
      onUnauthorized: () => {
        void provider.logout();
      }
    });
  }, [provider, guard]);
  return (
    <AppRoot
      provider={provider}
      rewardsStore={rewardsStore}
      checkStore={checkStore}
      sportStore={sportStore}
      syncEngine={syncEngine}
      wechat={
        wechatApi
          ? {
              available: wechatState.available,
              reason: wechatState.reason,
              onLogin: () => {
                void provider.beginWeChatLogin();
              }
            }
          : undefined
      }
      initialWeChatCallback={initialWeChatCallback}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#ffffff' }
});