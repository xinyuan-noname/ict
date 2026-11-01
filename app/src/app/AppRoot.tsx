import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { AuthProvider, AuthSnapshot } from '../auth/AuthProvider';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { userMessageFor } from '../shared/errorCatalog';

export interface AppRootProps {
  provider: AuthProvider;
}

// 导航守卫：restoring→骨架、anonymous→登录、authenticated→主页、unsupported→禁用（任务 33.4）。
export function AppRoot({ provider }: AppRootProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(provider.getSnapshot());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = provider.subscribe(setSnapshot);
    if (snapshot.state === 'restoring') {
      void provider.bootstrap();
    }
    return unsubscribe;
    // 仅在挂载时订阅一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (snapshot.state === 'restoring') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>登录态恢复中…</Text>
      </View>
    );
  }

  if (snapshot.state === 'unsupported') {
    return (
      <View style={styles.center}>
        <Text style={styles.unsupported}>当前环境暂不支持华为账号登录</Text>
      </View>
    );
  }

  if (snapshot.state === 'authenticated') {
    return (
      <HomeScreen
        user={snapshot.user}
        platform={providerPlatform(provider)}
        onLogout={() => {
          void provider.logout();
        }}
        onRefresh={() => provider.refreshProfile()}
      />
    );
  }

  return (
    <LoginScreen
      loading={busy}
      errorCode={snapshot.lastError?.code}
      errorMessage={snapshot.lastError ? userMessageFor(snapshot.lastError.code) : undefined}
      traceId={snapshot.lastError?.traceId}
      onLogin={() => {
        if (busy) {
          return;
        }
        setBusy(true);
        void provider.login().finally(() => setBusy(false));
      }}
    />
  );
}

function providerPlatform(provider: AuthProvider): string {
  return 'mobile';
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { marginTop: 12, color: '#666' },
  unsupported: { color: '#a61b1b', fontSize: 16, textAlign: 'center' }
});