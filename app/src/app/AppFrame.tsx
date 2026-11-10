import React from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CHECKLISTS } from '../check/checklistRegistry';
import type { ListKey } from '../navigation/shellState';
import { BrandMark } from '../ui/primitives';
import { palette, radius, shadow, useTheme } from '../ui/theme';

const FEATURE_ORDER: ListKey[] = ['water', 'medication', 'sport', 'english', 'custom'];

/**
 * 应用外壳：
 * - 原生 / Web 窄屏：单列 App，保持移动端体验；
 * - Web 宽屏：左侧产品叙事 + 右侧手机预览，用于比赛 Demo 与评审展示。
 */
export function AppFrame({ children }: { children: React.ReactNode }): React.JSX.Element {
  const isWeb = Platform.OS === 'web';
  const { width, height } = useWindowDimensions();
  const wide = isWeb && width >= 1080;

  if (wide) {
    return <DesktopStage height={height}>{children}</DesktopStage>;
  }

  if (!isWeb) {
    return <SafeAreaView style={styles.nativeRoot}>{children}</SafeAreaView>;
  }

  return (
    <View style={styles.mobileStage}>
      <View style={styles.mobileGlow} />
      <View style={[styles.mobileCard, width >= 520 && styles.mobileCardFloating]}>{children}</View>
    </View>
  );
}

function DesktopStage({ children, height }: { children: React.ReactNode; height: number }): React.JSX.Element {
  const { feature } = useTheme();
  const deviceHeight = Math.max(620, Math.min(842, height - 64));
  return (
    <View style={styles.stage}>
      <View style={styles.glowRed} />
      <View style={styles.glowBlue} />
      <View style={styles.gridLineOne} />
      <View style={styles.gridLineTwo} />

      <View style={styles.left}>
        <View style={styles.brandRow}>
          <BrandMark size={38} />
          <Text style={styles.brandName}>check</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>HUAWEI CLOUD · ICT</Text>
          </View>
        </View>

        <Text style={styles.headline}>把健康，{'\n'}变成每天都能{'\n'}完成的小事。</Text>
        <Text style={styles.lead}>
          饮水、服药、运动、英语 —— 一份真正能坚持的每日清单。记录、洞察、成就，在一个安静的应用里完成。
        </Text>

        <View style={styles.featureList}>
          {FEATURE_ORDER.map((key) => {
            const item = CHECKLISTS[key];
            const color = feature[key];
            return (
              <View key={key} style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: `${color.main}1F`, borderColor: `${color.main}38` }]}>
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.featureName}>{item.name}</Text>
                  <Text style={styles.featureDesc} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>
                <Text style={[styles.featureTag, { color: color.main }]}>{item.tagline}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.techRow}>
          {['React Native', 'Go', '华为账号', '云端同步'].map((item) => (
            <View key={item} style={styles.techChip}>
              <View style={styles.techDot} />
              <Text style={styles.techText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.deviceColumn}>
        <View style={[styles.device, { height: deviceHeight }]}>
          <View style={styles.deviceStatus}>
            <Text style={styles.deviceTime}>9:41</Text>
            <View style={styles.deviceStatusRight}>
              <Text style={styles.deviceSignal}>5G</Text>
              <View style={styles.battery}>
                <View style={styles.batteryFill} />
              </View>
            </View>
          </View>
          <View style={styles.deviceScreen}>{children}</View>
        </View>
        <View style={styles.captionRow}>
          <View style={styles.liveDot} />
          <Text style={styles.caption}>Live demo · 游客模式可完整体验</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1, backgroundColor: palette.surface },
  mobileStage: {
    flex: 1,
    backgroundColor: palette.canvasDeep,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileGlow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: palette.brand,
    opacity: 0.05,
    top: -200,
    right: -180
  },
  mobileCard: {
    width: '100%',
    maxWidth: 480,
    height: '100%',
    backgroundColor: palette.surface,
    overflow: 'hidden'
  },
  mobileCardFloating: {
    height: '94%',
    borderRadius: radius.xxl,
    ...shadow.float
  },
  stage: {
    flex: 1,
    backgroundColor: palette.night,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 64,
    paddingHorizontal: 52,
    paddingVertical: 28,
    overflow: 'hidden'
  },
  glowRed: {
    position: 'absolute',
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: palette.brand,
    opacity: 0.16,
    top: -300,
    left: -220
  },
  glowBlue: {
    position: 'absolute',
    width: 560,
    height: 560,
    borderRadius: 280,
    backgroundColor: '#2F80ED',
    opacity: 0.12,
    bottom: -300,
    right: -180
  },
  gridLineOne: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '56%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  gridLineTwo: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '18%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.035)'
  },
  left: { width: 560, maxWidth: '52%', zIndex: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 30, fontWeight: '800', color: palette.white, letterSpacing: 0.4 },
  badge: {
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.56)' },
  headline: {
    fontSize: 46,
    lineHeight: 56,
    fontWeight: '800',
    letterSpacing: -1.4,
    color: palette.white,
    marginTop: 38
  },
  lead: {
    marginTop: 18,
    maxWidth: 470,
    fontSize: 14,
    lineHeight: 23,
    color: 'rgba(235,238,247,0.62)'
  },
  featureList: { marginTop: 30, gap: 10 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureName: { fontSize: 14, fontWeight: '700', color: palette.white },
  featureDesc: { fontSize: 11, color: 'rgba(235,238,247,0.46)', marginTop: 2 },
  featureTag: { fontSize: 10, fontWeight: '700' },
  techRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 28 },
  techChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  techDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.34)' },
  techText: { fontSize: 10, color: 'rgba(235,238,247,0.55)', fontWeight: '600' },
  deviceColumn: { alignItems: 'center', zIndex: 3 },
  device: {
    width: 400,
    borderRadius: 44,
    backgroundColor: '#0A0C10',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    paddingHorizontal: 9,
    paddingBottom: 9,
    ...shadow.phone
  },
  deviceStatus: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12
  },
  deviceTime: { fontSize: 11, fontWeight: '700', color: palette.white },
  deviceStatusRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deviceSignal: { fontSize: 9, fontWeight: '700', color: palette.white },
  battery: {
    width: 18,
    height: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    padding: 1.2
  },
  batteryFill: { width: '72%', height: '100%', borderRadius: 1.5, backgroundColor: palette.white },
  deviceScreen: {
    flex: 1,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: palette.surface
  },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#42D392' },
  caption: { fontSize: 10, color: 'rgba(235,238,247,0.44)', letterSpacing: 0.2 }
});
