import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { palette, radius, space } from './theme';
import { IconBadge, Pill, ProgressBar, Surface, UIText } from './primitives';

export interface AchievementItem {
  key: string;
  name: string;
  desc: string;
  icon: string;
  points: number;
  unlocked: boolean;
  progress: number;
  need: number;
  /** 登录用户的四态；缺省时按 unlocked 布尔渲染。 */
  status?: 'locked' | 'unlocked' | 'granting' | 'granted';
  grantedPoints?: number;
}

export interface AchievementGroup {
  name: string;
  items: AchievementItem[];
}

function badgeOf(item: AchievementItem): { label: string; color: string } | null {
  if (item.status === 'granted') {
    const granted = item.grantedPoints ?? item.points;
    return { label: granted > 0 ? `已发放 +${granted}` : '已发放', color: palette.success };
  }
  if (item.status === 'granting') return { label: '发放中', color: palette.warning };
  if (item.unlocked) return { label: '已解锁', color: palette.success };
  return null;
}

/**
 * 成就分组导航栏：用于运动等多分组成就页。
 * 把「步行成就 / 骑行成就 / 配速…」从纵向段落提升为可切换的 nav 栏。
 */
export function AchievementGroupNav({
  groups,
  value,
  onChange,
  accent = palette.brand
}: {
  groups: AchievementGroup[];
  value: string;
  onChange: (name: string) => void;
  accent?: string;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.navContent}
      style={styles.navScroll}
    >
      {groups.map((group) => {
        const active = group.name === value;
        const unlocked = group.items.filter((item) => item.unlocked).length;
        return (
          <Pressable
            key={group.name}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(group.name)}
            style={({ pressed }) => [
              styles.navChip,
              active && { backgroundColor: accent, borderColor: accent },
              pressed && { opacity: 0.78 }
            ]}
          >
            <UIText
              variant="caption"
              color={active ? palette.white : palette.inkSoft}
              style={{ fontWeight: '700', fontSize: 11 }}
            >
              {group.name}
            </UIText>
            <View style={[styles.navCount, active && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <UIText variant="caption" color={active ? palette.white : palette.muted} style={{ fontSize: 9 }}>
                {unlocked}/{group.items.length}
              </UIText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function AchievementGrid({
  groups,
  accent = palette.brand,
  showHeader = true
}: {
  groups: AchievementGroup[];
  accent?: string;
  showHeader?: boolean;
}): React.JSX.Element {
  return (
    <View style={{ gap: space.lg }}>
      {groups.map((group) => {
        const unlocked = group.items.filter((item) => item.unlocked).length;
        const ratio = group.items.length > 0 ? unlocked / group.items.length : 0;
        return (
          <View key={group.name}>
            {showHeader ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <UIText variant="bodyStrong">{group.name}</UIText>
                  <UIText variant="caption" tone="muted">
                    {unlocked} / {group.items.length} 已解锁
                  </UIText>
                </View>
                <ProgressBar ratio={ratio} color={accent} height={5} style={{ marginBottom: 12 }} />
              </>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {group.items.map((item) => {
                const badge = badgeOf(item);
                const progressRatio = item.need > 0 ? Math.min(1, item.progress / item.need) : item.unlocked ? 1 : 0;
                return (
                  <Surface
                    key={item.key}
                    padding={12}
                    radiusValue={radius.md}
                    style={{ flexBasis: '47%', flexGrow: 1, minWidth: 148, opacity: item.unlocked ? 1 : 0.84 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <IconBadge
                        icon={item.unlocked ? item.icon : '🔒'}
                        accent={item.unlocked ? accent : palette.faint}
                        size={34}
                      />
                      <Pill
                        label={`+${item.points}`}
                        accent={item.unlocked ? accent : palette.muted}
                        tone="tint"
                      />
                    </View>
                    <UIText variant="bodyStrong" numberOfLines={1} style={{ marginTop: 10, fontSize: 13 }}>
                      {item.name}
                    </UIText>
                    <UIText
                      variant="caption"
                      tone="muted"
                      numberOfLines={2}
                      style={{ marginTop: 2, minHeight: 30, lineHeight: 15 }}
                    >
                      {item.desc}
                    </UIText>
                    <ProgressBar ratio={progressRatio} color={item.unlocked ? accent : palette.faint} height={4} style={{ marginTop: 8 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                      <UIText variant="caption" tone="faint">
                        {item.need > 1 ? `${Math.min(item.progress, item.need)} / ${item.need}` : item.unlocked ? '已完成' : '待解锁'}
                      </UIText>
                      {badge ? (
                        <UIText variant="caption" color={badge.color} style={{ fontWeight: '700' }}>
                          {badge.label}
                        </UIText>
                      ) : null}
                    </View>
                  </Surface>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navScroll: { marginBottom: 14, flexGrow: 0 },
  navContent: { gap: 7, paddingRight: 4 },
  navChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  navCount: {
    minWidth: 22,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.canvas,
    alignItems: 'center'
  }
});
