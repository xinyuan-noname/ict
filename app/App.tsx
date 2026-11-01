import React, { useMemo } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { AuthApi } from './src/api/authApi';
import { ApiClient } from './src/api/client';
import { AppRoot } from './src/app/AppRoot';
import { AuthProvider } from './src/auth/AuthProvider';
import { NativeAccountKitProvider } from './src/auth/providers/nativeAccountKit';
import { WebOAuthProvider, WindowsCapabilityProbe } from './src/auth/providers/webOAuth';
import type { AuthProviderStrategy, CapabilityProbe } from './src/auth/providers/types';
import { KeychainVault } from './src/native/SecureVault';
import { APP_VERSION, WINDOWS_REDIRECT_URI, defaultBaseUrl } from './src/shared/config';

export interface AppDependencies {
  baseUrl?: string;
  authorizeUrl?: string;
  provider?: AuthProviderStrategy;
  capability?: CapabilityProbe;
}

export function buildAuthProvider(deps: AppDependencies = {}): AuthProvider {
  const client = new ApiClient({ baseUrl: deps.baseUrl ?? defaultBaseUrl(), allowInsecure: __DEV__ });
  const api = new AuthApi(client);
  const isWindows = Platform.OS === 'windows' || process.env.RN_PLATFORM === 'windows';
  const strategy =
    deps.provider ??
    (isWindows
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
    clientVersion: APP_VERSION
  });
}

export default function App(): React.JSX.Element {
  const provider = useMemo(() => buildAuthProvider(), []);
  return (
    <SafeAreaView style={styles.root}>
      <AppRoot provider={provider} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' }
});