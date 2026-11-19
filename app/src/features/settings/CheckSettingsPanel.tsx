import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { CHECKLISTS, checklistsOf } from '../../check/checklistRegistry';
import { BUILTIN_LIST_KEYS, type EnabledLists } from '../../check/checkSettingsStore';
import type { CustomPlanMode, CustomPlanState } from '../../model/customPlan';
import type { Category, ListKey } from '../../navigation/shellState';
import { IconBadge, Pill, Surface, UIText } from '../../ui/primitives';
import { palette, radius, shadow, space, useTheme } from '../../ui/theme';

export interface CheckSettingsPanelProps {
  enabled: EnabledLists;
  customPlans: CustomPlanState[];
  onToggle: (key: ListKey, enabled: boolean) => void;
  onOpenCustom: (id: string) => void;
  onDeleteCustom: (id: string) => void;
  onCreateCustom: (mode: CustomPlanMode) => void;
  onClose: () => void;
}

const CATEGORY_TITLES: { key: Category; label: string; icon: string }[] = [
  { key: 'health', label: '健康', icon: '🌿' },
  { key: 'learning', label: '英语', icon: '📖' }
];

export function CheckSettingsPanel({
  enabled,
  customPlans,
  onToggle,
  onOpenCustom,
  onDeleteCustom,
  onCreateCustom,
  onClose
}: CheckSettingsPanelProps): React.JSX.Element {
  const { feature } = useTheme();

  const confirmDelete = (plan: CustomPlanState): void => {
    Alert.alert('删除自定义清单', `删除「${plan.plan.title}」后，它的进度和成就也会一并清除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDeleteCustom(plan.plan.id ?? '') }
    ]);
  };

  const renderCustomGroup = (mode: CustomPlanMode, title: string): React.JSX.Element => {
    const plans = customPlans.filter((item) => (item.plan.mode ?? 'recurring') === mode);
    return (
      <View style={{ marginTop: 12 }}>
        <View style={styles.groupHeader}>
          <View style={[styles.groupBadge, { backgroundColor: mode === 'deadline' ? feature.custom.wash : palette.surfaceAlt }]}>
            <UIText variant="caption" color={feature.custom.deep} style={{ fontWeight: '800' }}>
              {mode === 'deadline' ? '◷' : '↻'}
            </UIText>
          </View>
          <UIText variant="bodyStrong" style={{ flex: 1 }}>
            {title}
          </UIText>
          <Pill label={`${plans.length} 个`} accent={feature.custom.main} tone="outline" />
        </View>
        {plans.length === 0 ? (
          <UIText variant="caption" tone="muted" style={{ marginLeft: 42, marginBottom: 6 }}>
            还没有{title}，可在下方新建。
          </UIText>
        ) : (
          plans.map((plan) => (
            <View key={plan.plan.id ?? plan.plan.title} style={styles.customPlanCard}>
              <View style={styles.customTitleRow}>
                <IconBadge icon={plan.plan.icon} accent={feature.custom.main} size={30} />
                <View style={{ flex: 1 }}>
                  <UIText variant="bodyStrong">{plan.plan.title}</UIText>
                  <UIText variant="caption" tone="muted" numberOfLines={1}>
                    {plan.plan.skills.map((skill) => skill.name).join(' / ')}
                  </UIText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`打开 ${plan.plan.title}`}
                  onPress={() => onOpenCustom(plan.plan.id ?? '')}
                  style={styles.smallAction}
                >
                  <UIText variant="caption" color={feature.custom.deep} style={{ fontWeight: '700' }}>
                    打开
                  </UIText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除 ${plan.plan.title}`}
                  onPress={() => confirmDelete(plan)}
                  style={[styles.smallAction, { backgroundColor: palette.dangerTint }]}
                >
                  <UIText variant="caption" color={palette.danger} style={{ fontWeight: '700' }}>
                    删除
                  </UIText>
                </Pressable>
              </View>
              <View style={styles.skillTree}>
                {plan.plan.skills.map((skill) => (
                  <View key={skill.name} style={styles.skillTreeRow}>
                    <View style={styles.treeLine} />
                    <UIText variant="caption" tone="muted">
                      二级 · {skill.name}
                    </UIText>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => onCreateCustom(mode)}
          style={[styles.createButton, { borderColor: `${feature.custom.main}55` }]}
        >
          <UIText variant="caption" color={feature.custom.deep} style={{ fontWeight: '800' }}>
            ＋ 新建{title}
          </UIText>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
      <Surface style={styles.sheet} padding={0} radiusValue={radius.xl}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <UIText variant="h2">清单管理</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
              按一级 / 二级管理，内置与自定义分开
            </UIText>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.close}>
            <UIText variant="bodyStrong" tone="muted">
              ✕
            </UIText>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <UIText variant="caption" tone="muted" style={styles.sectionLabel}>
            内置清单
          </UIText>
          {CATEGORY_TITLES.map((category) => {
            const items = checklistsOf(category.key)
              .filter((item) => BUILTIN_LIST_KEYS.includes(item.key))
              .map((item) => CHECKLISTS[item.key]);
            return (
              <View key={category.key} style={styles.categoryGroup}>
                <View style={styles.categoryHeader}>
                  <UIText variant="caption" tone="muted">
                    {category.icon}
                  </UIText>
                  <UIText variant="bodyStrong">{category.label}</UIText>
                  <UIText variant="caption" tone="faint">
                    一级
                  </UIText>
                </View>
                {items.map((item) => {
                  const color = feature[item.key];
                  const value = enabled[item.key] !== false;
                  return (
                    <View key={item.key} style={styles.row}>
                      <View style={styles.treeLine} />
                      <IconBadge icon={item.icon} accent={color.main} size={30} />
                      <View style={{ flex: 1 }}>
                        <UIText variant="bodyStrong">{item.name}</UIText>
                        <UIText variant="caption" tone="muted">
                          二级 · {item.tagline}
                        </UIText>
                      </View>
                      <Switch
                        value={value}
                        onValueChange={(next) => onToggle(item.key, next)}
                        trackColor={{ false: palette.line, true: `${color.main}66` }}
                        thumbColor={value ? color.main : palette.faint}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}

          <View style={styles.divider} />
          <UIText variant="caption" tone="muted" style={styles.sectionLabel}>
            自定义清单
          </UIText>
          <UIText variant="caption" tone="faint" style={{ marginBottom: 6 }}>
            每个自定义清单是一级，清单内的技能是二级。
          </UIText>
          {renderCustomGroup('recurring', '重复性清单')}
          {renderCustomGroup('deadline', '截止性清单')}
        </ScrollView>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    justifyContent: 'flex-end'
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 14, 20, 0.42)'
  },
  sheet: {
    maxHeight: '86%',
    marginHorizontal: space.md,
    marginBottom: space.md,
    overflow: 'hidden',
    ...shadow.float
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceAlt
  },
  body: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xl
  },
  sectionLabel: {
    fontWeight: '800',
    marginBottom: 8
  },
  categoryGroup: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
    marginBottom: 8,
    backgroundColor: palette.surface
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line
  },
  treeLine: {
    width: 10,
    height: 1,
    backgroundColor: palette.line,
    marginLeft: 2
  },
  divider: {
    height: 1,
    backgroundColor: palette.line,
    marginTop: 10,
    marginBottom: 12
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  groupBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  customPlanCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
    padding: 9,
    marginBottom: 7
  },
  customTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  smallAction: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: palette.surface
  },
  skillTree: {
    marginTop: 5,
    marginLeft: 37,
    gap: 2
  },
  skillTreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  createButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 4,
    backgroundColor: 'transparent'
  }
});
