import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { userMessageFor } from '../shared/errorCatalog';
import { AppButton, BrandMark, Pill, Surface, UIText } from '../ui/primitives';
import { palette, radius, shadow, space } from '../ui/theme';

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

const FEATURES = [
  { icon: '💧', name: '喝水', color: '#2F80ED' },
  { icon: '💊', name: '服药', color: '#1F9D63' },
  { icon: '🏃', name: '运动', color: '#E8842C' },
  { icon: '📖', name: '英语', color: '#6C5CE7' }
];

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
  const busy = loading || wechatLoading;
  const huaweiDisabled = loading || loginDisabled || (showWeChat && !wechatEnabled);
  const guestIsPrimary = Boolean(guestPrimary) && !(showWeChat && wechatEnabled);

  return (
    <View style={styles.root}>
      <View style={styles.blobRed} />
      <View style={styles.blobBlue} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <BrandMark size={40} />
          <View>
            <UIText variant="h2" style={{ fontSize: 21, lineHeight: 25 }}>
              check
            </UIText>
            <UIText variant="caption" tone="muted">
              每日健康清单
            </UIText>
          </View>
        </View>

        <View style={styles.hero}>
          <Pill label="HUAWEI ID · 安全登录" accent={palette.brand} />
          <UIText variant="display" style={styles.heroTitle}>
            今天，也从{'\n'}一件小事开始。
          </UIText>
          <UIText variant="body" tone="muted" style={styles.heroText}>
            把喝水、服药、运动和学习放进同一份清单。记录得越轻，越容易坚持。
          </UIText>
        </View>

        <Surface padding={14} radiusValue={radius.lg} style={styles.featureCard}>
          <View style={styles.featureGrid}>
            {FEATURES.map((item) => (
              <View key={item.name} style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: `${item.color}14` }]}>
                  <UIText variant="bodyStrong">{item.icon}</UIText>
                </View>
                <View>
                  <UIText variant="bodyStrong" style={{ fontSize: 13 }}>
                    {item.name}
                  </UIText>
                  <UIText variant="caption" tone="faint">
                    今日可记录
                  </UIText>
                </View>
              </View>
            ))}
          </View>
        </Surface>

        <Surface style={styles.loginCard}>
          {message ? (
            <View style={styles.banner}>
              <UIText variant="bodyStrong" color={palette.danger} style={{ fontSize: 13 }}>
                {message}
              </UIText>
              {showCode ? (
                <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
                  {errorCode}
                  {traceId ? ` · traceId ${traceId}` : ''}
                </UIText>
              ) : null}
            </View>
          ) : null}

          <UIText variant="h2" style={{ fontSize: 19 }}>
            {showWeChat ? '登录 check' : '华为账号登录'}
          </UIText>
          <UIText variant="small" tone="muted" style={{ marginTop: 3, marginBottom: 16 }}>
            三端同一账号，数据在云端同步。
          </UIText>

          {showWeChat && wechatEnabled ? (
            <Pressable
              accessibilityRole="button"
              testID="wechat-login"
              disabled={busy}
              onPress={wechat?.onLogin}
              style={({ pressed }) => [styles.wechatButton, busy && styles.disabled, pressed && { opacity: 0.82 }]}
            >
              {wechat?.loading ? (
                <ActivityIndicator color={palette.white} size="small" />
              ) : (
                <>
                  <UIText variant="bodyStrong" color={palette.white}>
                    微信登录
                  </UIText>
                  <UIText variant="caption" color="rgba(255,255,255,0.72)">
                    Web 版推荐
                  </UIText>
                </>
              )}
            </Pressable>
          ) : null}
          {showWeChat && !wechatEnabled ? (
            <View style={styles.wechatHint}>
              <UIText variant="caption" color={palette.warning} style={{ fontWeight: '600' }}>
                微信登录暂不可用
              </UIText>
              <UIText variant="caption" tone="muted">
                可直接使用游客模式完整体验清单
              </UIText>
            </View>
          ) : null}

          {!loginDisabled ? (
            <AppButton
              label="华为账号登录"
              onPress={onLogin}
              disabled={huaweiDisabled}
              loading={loading}
              fullWidth
              accent={palette.brand}
              size="lg"
              style={{ marginTop: showWeChat ? 10 : 0 }}
            />
          ) : null}

          {onGuest ? (
            guestIsPrimary ? (
              <AppButton
                label="游客进入预览"
                onPress={onGuest}
                disabled={busy}
                fullWidth
                size="lg"
                accent={palette.brand}
                style={{ marginTop: 10 }}
                testID="guest-entry"
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                testID="guest-entry"
                disabled={busy}
                onPress={onGuest}
                style={({ pressed }) => [styles.guestButton, pressed && { opacity: 0.65 }]}
              >
                <UIText variant="bodyStrong" color={palette.brand}>
                  游客进入预览
                </UIText>
                <UIText variant="caption" tone="muted">
                  无需账号 · 数据保存在本机
                </UIText>
              </Pressable>
            )
          ) : null}

          {loginDisabled && loginHint ? (
            <View style={styles.hintBox}>
              <UIText variant="caption" tone="muted" style={{ textAlign: 'center', lineHeight: 17 }}>
                {loginHint}
              </UIText>
            </View>
          ) : null}

          <View style={styles.safeRow}>
            <UIText variant="caption" tone="faint">
              🔒 仅用于健康清单记录 · 不收集密码
            </UIText>
          </View>
        </Surface>

        <UIText variant="caption" tone="faint" align="center" style={{ marginTop: 18, lineHeight: 18 }}>
          登录即表示同意用户协议与隐私政策{'\n'}
          check · Huawei ICT Competition Demo
        </UIText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas, overflow: 'hidden' },
  blobRed: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: palette.brand,
    opacity: 0.055,
    top: -160,
    right: -120
  },
  blobBlue: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#2F80ED',
    opacity: 0.05,
    bottom: -120,
    left: -100
  },
  scroll: { paddingHorizontal: space.xl, paddingTop: 20, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { marginTop: 26 },
  heroTitle: { marginTop: 14, fontSize: 34, lineHeight: 42 },
  heroText: { marginTop: 10, maxWidth: 380, lineHeight: 22 },
  featureCard: { marginTop: 20, backgroundColor: palette.surfaceAlt },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  featureItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loginCard: { marginTop: 16, ...shadow.card },
  banner: {
    backgroundColor: palette.dangerTint,
    borderWidth: 1,
    borderColor: `${palette.danger}26`,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 14
  },
  wechatButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: '#07C160',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  disabled: { opacity: 0.45 },
  wechatHint: {
    backgroundColor: palette.warningTint,
    borderWidth: 1,
    borderColor: `${palette.warning}26`,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 2,
    marginBottom: 10
  },
  guestButton: {
    marginTop: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  hintBox: { marginTop: 4, paddingHorizontal: 6 },
  safeRow: { marginTop: 14, alignItems: 'center' }
});
