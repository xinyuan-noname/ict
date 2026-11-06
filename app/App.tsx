import React, { useMemo } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { AuthApi } from './src/api/authApi';
import { ApiClient } from './src/api/client';
import { AppRoot } from './src/app/AppRoot';
import { AuthProvider } from './src/auth/AuthProvider';
import { NativeAccountKitProvider } from './src/auth/providers/nativeAccountKit';
import { WebOAuthProvider, WindowsCapabilityProbe } from './src/auth/providers/webOAuth';
import { WebUnsupportedProvider } from './src/auth/providers/webUnsupported';
import { AppDialogHost } from './src/components/AppDialog';
import type { AuthProviderStrategy, CapabilityProbe } from './src/auth/providers/types';
import { RewardsApi } from './src/api/rewardsApi';
import { CheckApi } from './src/api/checkApi';
import { CheckStore } from './src/check/checkStore';
import { RewardsStore } from './src/rewards/rewardsStore';
import { GuestNetworkGuard } from './src/guest/GuestNetworkGuard';
import { GuestStore } from './src/guest/GuestStore';
import { AsyncStorageGuestStorage } from './src/guest/GuestStorage';
import { KeychainVault } from './src/native/SecureVault';
import { APP_VERSION, WINDOWS_REDIRECT_URI, defaultBaseUrl } from './src/shared/config';

export interface AppDependencies {
  baseUrl?: string;
  authorizeUrl?: string;
  provider?: AuthProviderStrategy;
  capability?: CapabilityProbe;
  guard?: GuestNetworkGuard;
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
    networkGuard: deps.guard
  });
}

export default function App(): React.JSX.Element {
  const guard = useMemo(() => new GuestNetworkGuard(), []);
  const provider = useMemo(() => buildAuthProvider({ guard }), [guard]);
  const rewardsStore = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new RewardsStore({ api: new RewardsApi(client), getToken: () => provider.currentToken() });
  }, [provider, guard]);
  const checkStore = useMemo(() => {
    const client = new ApiClient({ baseUrl: defaultBaseUrl(), allowInsecure: __DEV__, guard });
    return new CheckStore({ api: new CheckApi(client), getToken: () => provider.currentToken() });
  }, [provider, guard]);
  return (
    <SafeAreaView style={styles.root}>
      <AppRoot provider={provider} rewardsStore={rewardsStore} checkStore={checkStore} />
      <AppDialogHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: '#ffffff' }
});