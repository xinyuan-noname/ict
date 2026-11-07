import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import type { AuthProvider, AuthSnapshot } from '../auth/AuthProvider';
import type { CheckStore } from '../check/checkStore';
import type { RewardsStore } from '../rewards/rewardsStore';
import type { SportStore } from '../sport/sportStore';
import { CheckShell } from '../screens/CheckShell';
import { LoginScreen } from '../screens/LoginScreen';
import { RewardsScreen } from '../screens/RewardsScreen';
import { userMessageFor } from '../shared/errorCatalog';

export interface AppRootProps {
  provider: AuthProvider;
  rewardsStore: RewardsStore;
  checkStore: CheckStore;
  sportStore?: SportStore;
}

// 导航守卫：恢复中 → 登录 → check 清单主页（游客/登录共用外壳）。
export function AppRoot({ provider, rewardsStore, checkStore, sportStore }: AppRootProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(provider.getSnapshot());
  const [busy, setBusy] = useState(false);
  const [showRewards, setShowRewards] = useState(false);

  useEffect(() => {
    const unsubscribe = provider.subscribe((next) => {
      setSnapshot(next);
      if (next.state !== 'authenticated') {
        setShowRewards(false);
        rewardsStore.reset();
      }
      if (next.state !== 'guest') {
        checkStore.reset();
      }
    });
    if (provider.getSnapshot().state === 'restoring') {
      void provider.bootstrap();
    }
    return unsubscribe;
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

  if (snapshot.state === 'guest') {
    return (
      <CheckShell
        store={checkStore}
        isGuest
        displayName="游客"
        sportStore={sportStore}
        onUpgrade={() => {
          void provider.login();
        }}
        onExit={() => {
          void provider.exitGuest();
        }}
      />
    );
  }

  if (snapshot.state === 'authenticated') {
    if (showRewards) {
      return (
        <RewardsScreen
          store={rewardsStore}
          avatarUrl={snapshot.user?.avatarUrl}
          onBack={() => setShowRewards(false)}
        />
      );
    }
    return (
      <CheckShell
        store={checkStore}
        isGuest={false}
        displayName={snapshot.user?.displayName ?? '华为用户'}
        sportStore={sportStore}
        onOpenRewards={() => setShowRewards(true)}
        onExit={() => {
          void provider.logout();
        }}
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
        if (busy) return;
        setBusy(true);
        void provider.login().finally(() => setBusy(false));
      }}
      onGuest={() => {
        if (busy) return;
        void provider.enterGuest();
      }}
      loginDisabled={Platform.OS === 'web'}
      loginHint="网页版暂不支持华为账号登录，请使用「游客进入预览」"
      guestPrimary={Platform.OS === 'web'}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { marginTop: 12, color: '#666' }
});