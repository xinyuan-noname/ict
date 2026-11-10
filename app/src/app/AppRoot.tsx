import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import type { AuthProvider, AuthSnapshot } from '../auth/AuthProvider';
import type { CheckStore } from '../check/checkStore';
import type { RewardsStore } from '../rewards/rewardsStore';
import type { SportStore } from '../sport/sportStore';
import type { SyncEngine } from '../sync/syncEngine';
import { CheckShell } from '../screens/CheckShell';
import { LoginScreen } from '../screens/LoginScreen';
import { RewardsScreen } from '../screens/RewardsScreen';
import { SystemScreen } from '../screens/SystemScreen';
import { userMessageFor } from '../shared/errorCatalog';
import { BrandMark, UIText } from '../ui/primitives';
import { palette } from '../ui/theme';

export interface AppRootProps {
  provider: AuthProvider;
  rewardsStore: RewardsStore;
  checkStore: CheckStore;
  sportStore?: SportStore;
  syncEngine?: SyncEngine;
  /** Web 微信能力；三端不传，页面与请求零变化 */
  wechat?: { available: boolean; reason?: string; onLogin: () => void };
  /** 挂载前捕获的微信回跳上下文（仅 Web） */
  initialWeChatCallback?:
    | { kind: 'success'; code: string; state: string }
    | { kind: 'cancelled' }
    | { kind: 'error'; message: string }
    | { kind: 'none' }
    | null;
}

// 导航守卫：恢复中 → 登录 → check 清单主页（游客/登录共用外壳）。
export function AppRoot({
  provider,
  rewardsStore,
  checkStore,
  sportStore,
  syncEngine,
  wechat,
  initialWeChatCallback
}: AppRootProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(provider.getSnapshot());
  const [busy, setBusy] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [wechatError, setWechatError] = useState<string | undefined>(undefined);
  const [pointsBalance, setPointsBalance] = useState<number | undefined>(
    rewardsStore.getSnapshot().status?.pointsBalance
  );

  useEffect(() => {
    const unsubscribe = rewardsStore.subscribe((next) => {
      setPointsBalance(next.status?.pointsBalance);
    });
    return unsubscribe;
  }, [rewardsStore]);

  // Demo 直达：Web 演示链接可用 ?demo=guest 直接进入游客主页，方便评审与截图。
  // 仅在 Web 生效，且必须由用户此次访问显式携带；不改变默认真实登录流程。
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (demo === 'guest' && snapshot.state === 'anonymous') {
      void provider.enterGuest();
    }
  }, [provider, snapshot.state]);

  // 回跳上下文只消费一次；成功即换票，异常直接回登录页提示。
  useEffect(() => {
    if (!initialWeChatCallback) {
      return;
    }
    if (initialWeChatCallback.kind === 'success') {
      void provider.completeWeChatLogin({
        code: initialWeChatCallback.code,
        state: initialWeChatCallback.state
      });
    } else if (initialWeChatCallback.kind === 'error') {
      setWechatError(initialWeChatCallback.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upgrade = (): void => {
    if (wechat?.available) {
      wechat.onLogin();
      return;
    }
    void provider.login();
  };

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
      if (next.state !== 'guest' && next.state !== 'authenticated') {
        setShowSystem(false);
      }
    });
    if (provider.getSnapshot().state === 'restoring') {
      void provider.bootstrap();
    }
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // 同步仅在已登录态运行；游客与未登录零请求（SYNC-02/09）。
  useEffect(() => {
    if (!syncEngine) {
      return;
    }
    if (snapshot.state === 'authenticated') {
      syncEngine.start();
    } else {
      syncEngine.stop();
    }
    return () => syncEngine.stop();
  }, [snapshot.state, syncEngine]);

  if (snapshot.state === 'restoring') {
    return (
      <View style={styles.center}>
        <BrandMark size={44} />
        <UIText variant="h2" style={{ marginTop: 14 }}>
          正在恢复登录态
        </UIText>
        <ActivityIndicator color={palette.brand} style={{ marginTop: 14 }} />
        <Text style={styles.hint}>校验云端会话，请稍候…</Text>
      </View>
    );
  }

  if (snapshot.state === 'guest') {
    if (showSystem) {
      return <SystemScreen isGuest onBack={() => setShowSystem(false)} />;
    }
    return (
      <CheckShell
        store={checkStore}
        isGuest
        displayName="游客"
        sportStore={sportStore}
        pointsBalance={pointsBalance}
        onSync={() => void syncEngine?.flush()}
        onUpgrade={() => {
          upgrade();
        }}
        onExit={() => {
          void provider.exitGuest();
        }}
        onOpenSystem={() => setShowSystem(true)}
      />
    );
  }

  if (snapshot.state === 'authenticated') {
    if (showSystem) {
      return <SystemScreen isGuest={false} onBack={() => setShowSystem(false)} />;
    }
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
        pointsBalance={pointsBalance}
        authToken={provider.currentToken() ?? undefined}
        onSync={() => void syncEngine?.flush()}
        onOpenRewards={() => setShowRewards(true)}
        onOpenSystem={() => setShowSystem(true)}
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
      errorMessage={
        wechatError ??
        (snapshot.lastError ? userMessageFor(snapshot.lastError.code) : undefined)
      }
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
      wechat={
        wechat
          ? {
              available: wechat.available,
              reason: wechat.reason,
              onLogin: wechat.onLogin
            }
          : undefined
      }
      loginDisabled={Platform.OS === 'web'}
      loginHint={
        wechat
          ? '网页版暂不支持华为账号登录，请使用微信登录或游客进入'
          : '网页版暂不支持华为账号登录，请使用「游客进入预览」'
      }
      guestPrimary={Platform.OS === 'web' && !wechat?.available}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.canvas },
  hint: { marginTop: 8, color: palette.muted, fontSize: 12 }
});