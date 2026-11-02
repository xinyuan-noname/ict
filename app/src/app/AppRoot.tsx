import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { AuthProvider, AuthSnapshot } from '../auth/AuthProvider';
import type { RewardsStore } from '../rewards/rewardsStore';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RewardsScreen } from '../screens/RewardsScreen';
import { userMessageFor } from '../shared/errorCatalog';

export interface AppRootProps {
  provider: AuthProvider;
  rewardsStore: RewardsStore;
}

// 导航守卫：restoring→骨架、anonymous→登录、authenticated→主页/奖励页、unsupported→禁用。
export function AppRoot({ provider, rewardsStore }: AppRootProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(provider.getSnapshot());
  const [rewardsSnapshot, setRewardsSnapshot] = useState(rewardsStore.getSnapshot());
  const [busy, setBusy] = useState(false);
  const [showRewards, setShowRewards] = useState(false);

  useEffect(() => {
    const unsubscribe = provider.subscribe((next) => {
      setSnapshot(next);
      if (next.state !== 'authenticated') {
        setShowRewards(false);
        rewardsStore.reset();
      }
    });
    const unsubscribeRewards = rewardsStore.subscribe(setRewardsSnapshot);
    if (provider.getSnapshot().state === 'restoring') {
      void provider.bootstrap();
    }
    return () => {
      unsubscribe();
      unsubscribeRewards();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, rewardsStore]);

  useEffect(() => {
    if (snapshot.state === 'authenticated') {
      void rewardsStore.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.state]);

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
      <HomeScreen
        user={snapshot.user}
        platform="mobile"
        pointsBalance={rewardsSnapshot.status?.pointsBalance ?? 0}
        onOpenRewards={() => setShowRewards(true)}
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { marginTop: 12, color: '#666' },
  unsupported: { color: '#a61b1b', fontSize: 16, textAlign: 'center' }
});