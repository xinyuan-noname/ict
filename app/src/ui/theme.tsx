import React, { createContext, useContext, useMemo } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * check 设计系统 —— 单一主题源。
 *
 * 规则：
 * 1. 页面不写死颜色、字号、圆角，统一从 theme / ui 组件取；
 * 2. 新增清单只需在 checklistRegistry 里登记 accent 键，并从 featurePalette 取色；
 * 3. 需要接入深色模式时，在这里扩展 AppTheme 并给 ThemeProvider 传入新主题即可。
 */

export type FeatureKey = 'water' | 'medication' | 'sport' | 'english';

export interface FeaturePalette {
  /** 主色：图表、进度、图标 */
  main: string;
  /** 深色：大数字、强调文本 */
  deep: string;
  /** 浅底：图标底、选中底 */
  tint: string;
  /** 页面柔光：卡片背景 */
  wash: string;
  /** 语义名称 */
  label: string;
}

export const featurePalette: Record<FeatureKey, FeaturePalette> = {
  water: { main: '#2F80ED', deep: '#1B5FCC', tint: '#EAF2FF', wash: '#F4F8FF', label: '喝水' },
  medication: { main: '#1F9D63', deep: '#147A4B', tint: '#E8F7F0', wash: '#F3FBF7', label: '服药' },
  sport: { main: '#E8842C', deep: '#C56514', tint: '#FFF2E6', wash: '#FFF9F3', label: '运动' },
  english: { main: '#6C5CE7', deep: '#5142C8', tint: '#EFEDFF', wash: '#F7F5FF', label: '英语' }
};

export const palette = {
  brand: '#C7000B',
  brandDeep: '#8E0007',
  brandTint: '#FFF0F1',
  ink: '#12141A',
  inkSoft: '#343944',
  muted: '#8B909B',
  faint: '#B6BAC3',
  line: '#ECEEF3',
  canvas: '#F4F5F8',
  canvasDeep: '#EDEFF4',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFBFC',
  success: '#1F9D63',
  successTint: '#E8F7F0',
  warning: '#D98900',
  warningTint: '#FFF6E5',
  danger: '#C7000B',
  dangerTint: '#FFF0F1',
  night: '#0B0E14',
  nightSoft: '#141924',
  nightLine: 'rgba(255,255,255,0.09)',
  nightText: '#F5F6FA',
  nightMuted: 'rgba(235,238,247,0.58)',
  white: '#FFFFFF',
  black: '#000000'
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 999
} as const;

export const type = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  h1: { fontSize: 26, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  h2: { fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.2 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: '400' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
  metric: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 }
} satisfies Record<string, TextStyle>;

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  } satisfies ViewStyle,
  float: {
    shadowColor: '#101828',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10
  } satisfies ViewStyle,
  phone: {
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 28 },
    elevation: 22
  } satisfies ViewStyle
};

export interface AppTheme {
  key: 'light' | 'night';
  palette: typeof palette;
  feature: Record<FeatureKey, FeaturePalette>;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  shadow: typeof shadow;
}

export const lightTheme: AppTheme = {
  key: 'light',
  palette,
  feature: featurePalette,
  space,
  radius,
  type,
  shadow
};

const ThemeContext = createContext<AppTheme>(lightTheme);

export function ThemeProvider({
  theme = lightTheme,
  children
}: {
  theme?: AppTheme;
  children: React.ReactNode;
}): React.JSX.Element {
  const value = useMemo(() => theme, [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

// 非组件模块（纯函数、静态 StyleSheet）使用的默认主题。
export const theme = lightTheme;
