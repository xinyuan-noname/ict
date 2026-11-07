import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { userMessageFor } from '../shared/errorCatalog';

export interface LoginScreenWeChat {
  available: boolean;
  reason?: string;
  loading?: boolean;
  onLogin: () => void;
}

export interface LoginScreenProps {
  loading: boolean;
  errorCode?: string;
  errorMessage?: string;
  traceId?: string;
  onLogin: () => void;
  onGuest?: () => void;
  loginDisabled?: boolean;
  loginHint?: string;
  /** 游客入口是否为主操作（Web：华为登录禁用，游客是唯一主路径） */
  guestPrimary?: boolean;
  /** Web 微信登录能力；三端不传时渲染与现状完全等价 */
  wechat?: LoginScreenWeChat;
}

// 未传 wechat 时：单华为按钮 + 游客（三端现状）。
// 传 wechat 时：微信（主）→ 游客（次）→ 华为禁用 + 说明。
export function LoginScreen({
  loading,
  errorCode,
  errorMessage,
  traceId,
  onLogin,
  onGuest,
  loginDisabled,
  loginHint,
  guestPrimary,
  wechat
}: LoginScreenProps): React.JSX.Element {
  const message = errorMessage ?? (errorCode ? userMessageFor(errorCode) : undefined);
  const showCode = errorCode !== undefined && errorCode !== 'AUTH_002';
  const showWeChat = Boolean(wechat);
  const wechatEnabled = wechat?.available === true;
  const wechatLoading = loading || wechat?.loading === true;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{showWeChat ? '登录' : '华为账号登录'}</Text>
      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
          {showCode ? <Text style={styles.codeText}>{errorCode}</Text> : null}
          {traceId ? <Text style={styles.codeText}>traceId: {traceId}</Text> : null}
        </View>
      ) : null}

      {showWeChat ? (
        <Pressable
          accessibilityRole="button"
          testID="wechat-login"
          disabled={!wechatEnabled || wechatLoading}
          onPress={wechat?.onLogin}
          style={[styles.wechatButton, !wechatEnabled && styles.buttonDisabled]}
        >
          {wechat?.loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{wechatEnabled ? '微信登录' : '微信登录暂不可用'}</Text>
          )}
        </Pressable>
      ) : null}
      {showWeChat && !wechatEnabled ? (
        <Text style={styles.loginHint}>可使用游客模式继续体验</Text>
      ) : null}

      {onGuest ? (
        <Pressable
          accessibilityRole="button"
          testID="guest-entry"
          disabled={wechatLoading}
          onPress={onGuest}
          style={[styles.guest, showWeChat && wechatEnabled ? styles.guestSecondary : styles.guestPrimary]}
        >
          <Text
            style={showWeChat && wechatEnabled ? styles.guestText : styles.guestPrimaryText}
          >
            游客进入预览
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={loading || loginDisabled || (showWeChat && !wechatEnabled) || wechatLoading}
        onPress={onLogin}
        style={[
          styles.button,
          (loading || loginDisabled || (showWeChat && !wechatEnabled) || wechatLoading) && styles.buttonDisabled,
          (guestPrimary || showWeChat) && styles.buttonSecondary
        ]}
      >
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>华为账号登录</Text>}
      </Pressable>
      {loginDisabled && loginHint ? <Text style={styles.loginHint}>{loginHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 32 },
  banner: { backgroundColor: '#fdecec', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' },
  bannerText: { color: '#a61b1b', fontSize: 14 },
  codeText: { color: '#7a7a7a', fontSize: 12, marginTop: 4 },
  button: { backgroundColor: '#c7000b', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 48, marginTop: 18 },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: { backgroundColor: '#e5e5e5' },
  wechatButton: {
    backgroundColor: '#07c160',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 220,
    alignItems: 'center'
  },
  loginHint: { color: '#999', fontSize: 12, textAlign: 'center', marginTop: 10, maxWidth: 280 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  guest: { marginTop: 14, padding: 10 },
  guestPrimary: {
    marginTop: 24,
    backgroundColor: '#c7000b',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 48
  },
  guestSecondary: { marginTop: 16, padding: 10 },
  guestText: { color: '#999', fontSize: 14 },
  guestPrimaryText: { color: '#ffffff', fontSize: 16, fontWeight: '600' }
});