import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle
} from 'react-native';
import { palette, radius, shadow, space, type as typography, useTheme, type FeatureKey } from './theme';

/* ------------------------------------------------------------------ */
/* 文本                                                                */
/* ------------------------------------------------------------------ */

export type TextVariant = 'display' | 'h1' | 'h2' | 'title' | 'body' | 'bodyStrong' | 'small' | 'caption' | 'label' | 'metric';
export type TextTone = 'ink' | 'muted' | 'faint' | 'brand' | 'inverse' | 'success' | 'warning' | 'danger';

const toneColor: Record<TextTone, string> = {
  ink: palette.ink,
  muted: palette.muted,
  faint: palette.faint,
  brand: palette.brand,
  inverse: palette.white,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger
};

export interface UITextProps extends Omit<TextProps, 'style' | 'children'> {
  variant?: TextVariant;
  tone?: TextTone;
  color?: string;
  align?: TextStyle['textAlign'];
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

export function UIText({
  variant = 'body',
  tone = 'ink',
  color,
  align,
  style,
  children,
  ...rest
}: UITextProps): React.JSX.Element {
  return (
    <Text
      {...rest}
      style={[typography[variant] as TextStyle, { color: color ?? toneColor[tone], textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* 容器                                                                */
/* ------------------------------------------------------------------ */

export type SurfaceTone = 'card' | 'soft' | 'outline' | 'dark' | 'brand' | 'transparent';

export interface SurfaceProps {
  children?: React.ReactNode;
  tone?: SurfaceTone;
  padding?: number;
  radiusValue?: number;
  shadowed?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const surfaceStyle: Record<SurfaceTone, ViewStyle> = {
  card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  soft: { backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.line },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.line },
  dark: { backgroundColor: palette.night, borderWidth: 1, borderColor: palette.nightLine },
  brand: { backgroundColor: palette.brand },
  transparent: { backgroundColor: 'transparent' }
};

export function Surface({
  children,
  tone = 'card',
  padding = space.lg,
  radiusValue = radius.lg,
  shadowed = true,
  style,
  testID
}: SurfaceProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      style={[
        surfaceStyle[tone],
        { padding, borderRadius: radiusValue },
        tone === 'card' && shadowed ? shadow.card : null,
        style
      ]}
    >
      {children}
    </View>
  );
}

export function PageScroll({
  children,
  style,
  contentStyle,
  testID
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  return (
    <ScrollView
      testID={testID}
      style={[styles.pageScroll, style]}
      contentContainerStyle={[styles.pageScrollContent, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[styles.divider, style]} />;
}

/* ------------------------------------------------------------------ */
/* 品牌与图标                                                          */
/* ------------------------------------------------------------------ */

export function BrandMark({
  size = 34,
  accent = palette.brand,
  glyph = '✓'
}: {
  size?: number;
  accent?: string;
  glyph?: string;
}): React.JSX.Element {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: accent,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text style={{ color: palette.white, fontSize: size * 0.5, fontWeight: '800', marginTop: -1 }}>{glyph}</Text>
    </View>
  );
}

export function IconBadge({
  icon,
  accent = palette.brand,
  size = 42,
  variant = 'tint',
  rounded = true
}: {
  icon: string;
  accent?: string;
  size?: number;
  variant?: 'tint' | 'solid' | 'outline';
  rounded?: boolean;
}): React.JSX.Element {
  const background = variant === 'solid' ? accent : variant === 'outline' ? 'transparent' : `${accent}18`;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? size * 0.32 : size / 2,
        backgroundColor: background,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: `${accent}45`,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text style={{ fontSize: size * 0.44, lineHeight: size * 0.56 }}>{icon}</Text>
    </View>
  );
}

export function Pill({
  label,
  accent = palette.brand,
  tone = 'tint',
  icon,
  dot = false,
  style
}: {
  label: string;
  accent?: string;
  tone?: 'tint' | 'solid' | 'outline';
  icon?: string;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const solid = tone === 'solid';
  const background = solid ? accent : tone === 'outline' ? 'transparent' : `${accent}16`;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: background,
          borderWidth: tone === 'outline' ? 1 : 0,
          borderColor: `${accent}55`
        },
        style
      ]}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: solid ? palette.white : accent }} /> : null}
      {icon ? <Text style={{ fontSize: 11, color: solid ? palette.white : accent }}>{icon}</Text> : null}
      <Text style={{ fontSize: 11, fontWeight: '700', color: solid ? palette.white : accent }}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 按钮                                                                */
/* ------------------------------------------------------------------ */

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  accent = palette.brand,
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  testID,
  style
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft' | 'dark';
  accent?: string;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const blocked = disabled || loading;
  const heights = { sm: 36, md: 46, lg: 54 } as const;
  const paletteByVariant: Record<typeof variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: accent, fg: palette.white, border: accent },
    secondary: { bg: palette.surface, fg: accent, border: `${accent}66` },
    ghost: { bg: 'transparent', fg: accent, border: 'transparent' },
    soft: { bg: `${accent}14`, fg: accent, border: 'transparent' },
    dark: { bg: palette.night, fg: palette.white, border: palette.night }
  };
  const color = paletteByVariant[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: heights[size],
          backgroundColor: color.bg,
          borderColor: color.border,
          opacity: blocked ? 0.45 : pressed ? 0.82 : 1,
          alignSelf: fullWidth ? 'stretch' : 'center'
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color.fg} size="small" />
      ) : (
        <>
          {icon ? <Text style={{ fontSize: size === 'sm' ? 13 : 15, color: color.fg }}>{icon}</Text> : null}
          <Text style={{ fontSize: size === 'sm' ? 13 : 15, fontWeight: '700', color: color.fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* 分段器                                                              */
/* ------------------------------------------------------------------ */

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  icon?: string;
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  accent = palette.brand,
  compact = false,
  style
}: {
  options: readonly SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  accent?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.segmentTrack, compact && styles.segmentTrackCompact, style]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive, compact && styles.segmentItemCompact]}
          >
            {option.icon ? (
              <Text style={{ fontSize: compact ? 12 : 13, color: active ? accent : palette.muted }}>{option.icon}</Text>
            ) : null}
            <Text
              style={{
                fontSize: compact ? 12 : 13,
                fontWeight: active ? '700' : '500',
                color: active ? accent : palette.muted
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 标题与指标                                                          */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  eyebrow,
  title,
  caption,
  actionLabel,
  onAction,
  accent = palette.brand,
  style
}: {
  eyebrow?: string;
  title: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  accent?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <UIText variant="label" color={accent} style={{ marginBottom: 4 }}>
            {eyebrow}
          </UIText>
        ) : null}
        <UIText variant="h2">{title}</UIText>
        {caption ? (
          <UIText variant="small" tone="muted" style={{ marginTop: 3 }}>
            {caption}
          </UIText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{actionLabel}</Text>
          <Text style={{ fontSize: 14, color: accent, marginTop: -1 }}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatTile({
  value,
  label,
  unit,
  accent = palette.ink,
  icon,
  style
}: {
  value: string | number;
  label: string;
  unit?: string;
  accent?: string;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.statTile, style]}>
      {icon ? <Text style={{ fontSize: 13, marginBottom: 4 }}>{icon}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={{ fontSize: 21, lineHeight: 26, fontWeight: '800', color: accent }} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={{ fontSize: 11, color: palette.muted, fontWeight: '600' }}>{unit}</Text> : null}
      </View>
      <Text style={{ fontSize: 10.5, color: palette.muted, marginTop: 3 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({
  ratio,
  color = palette.brand,
  trackColor = palette.line,
  height = 8,
  style
}: {
  ratio: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const value = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.round(value * 100)}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 空态 / 列表行 / 头像                                                */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon = '✦',
  title,
  message,
  actionLabel,
  onAction,
  accent = palette.brand
}: {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  accent?: string;
}): React.JSX.Element {
  return (
    <View style={styles.empty}>
      <IconBadge icon={icon} accent={accent} size={52} />
      <UIText variant="title" align="center" style={{ marginTop: 12 }}>
        {title}
      </UIText>
      {message ? (
        <UIText variant="small" tone="muted" align="center" style={{ marginTop: 5, lineHeight: 19 }}>
          {message}
        </UIText>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} variant="soft" accent={accent} size="sm" style={{ marginTop: 14 }} />
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  accent = palette.brand,
  right,
  last = false
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  accent?: string;
  right?: React.ReactNode;
  last?: boolean;
}): React.JSX.Element {
  const content = (
    <>
      {icon ? <IconBadge icon={icon} accent={accent} size={36} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <UIText variant="bodyStrong" numberOfLines={1}>
          {title}
        </UIText>
        {subtitle ? (
          <UIText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </UIText>
        ) : null}
      </View>
      {value ? (
        <UIText variant="small" tone="muted" numberOfLines={1}>
          {value}
        </UIText>
      ) : null}
      {right}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.listRow, !last && styles.listRowBorder]}>{content}</View>
  );
}

export function AppAvatar({
  uri,
  name,
  size = 44,
  accent = palette.brand,
  ring = false
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  accent?: string;
  ring?: boolean;
}): React.JSX.Element {
  const initial = (name ?? '').trim().slice(0, 1) || '华';
  const imageStyle: StyleProp<ImageStyle> = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: `${accent}18`
  };
  return (
    <View
      style={{
        width: size + (ring ? 6 : 0),
        height: size + (ring ? 6 : 0),
        borderRadius: (size + (ring ? 6 : 0)) / 2,
        borderWidth: ring ? 2 : 0,
        borderColor: ring ? `${accent}55` : 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={imageStyle} />
      ) : (
        <View style={[imageStyle, { alignItems: 'center', justifyContent: 'center', backgroundColor: accent }]}>
          <Text style={{ color: palette.white, fontSize: size * 0.38, fontWeight: '800' }}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 底部抽屉                                                            */
/* ------------------------------------------------------------------ */

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  maxWidth = 480
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetMask} onPress={onClose}>
        <Pressable style={[styles.sheetCard, { maxWidth }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <UIText variant="title">{title}</UIText>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} style={styles.sheetClose}>
              <Text style={{ fontSize: 16, color: palette.muted }}>✕</Text>
            </Pressable>
          </View>
          <View style={{ flexShrink: 1 }}>{children}</View>
          {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function HeaderBar({
  title,
  subtitle,
  onBack,
  right,
  accent = palette.brand
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  accent?: string;
}): React.JSX.Element {
  return (
    <View style={styles.headerBar}>
      <View style={{ width: 40 }}>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10} style={styles.backButton}>
            <Text style={{ fontSize: 22, color: palette.ink, marginTop: -2 }}>‹</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <UIText variant="title">{title}</UIText>
        {subtitle ? (
          <UIText variant="caption" color={accent} style={{ marginTop: 1 }}>
            {subtitle}
          </UIText>
        ) : null}
      </View>
      <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function FeatureDot({ feature }: { feature: FeatureKey }): React.JSX.Element {
  const { feature: colors } = useTheme();
  const color = colors[feature];
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.main }} />;
}

const styles = StyleSheet.create({
  pageScroll: { flex: 1, minHeight: 0 },
  pageScrollContent: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: 40 },
  divider: { height: 1, backgroundColor: palette.line },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: palette.canvasDeep,
    borderRadius: radius.pill,
    padding: 4,
    gap: 2
  },
  segmentTrackCompact: { padding: 3 },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8
  },
  segmentItemActive: {
    backgroundColor: palette.surface,
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  segmentItemCompact: { minHeight: 30 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.md,
    gap: 12
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 2,
    minHeight: 58
  },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: palette.line },
  sheetMask: {
    flex: 1,
    backgroundColor: 'rgba(9, 12, 18, 0.46)',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  sheetCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: 8,
    paddingBottom: 26
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 10
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.canvas,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: 10,
    paddingBottom: 8
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
