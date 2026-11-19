import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { CHECKLISTS } from '../../check/checklistRegistry';
import { BUILTIN_LIST_KEYS, type EnabledLists } from '../../check/checkSettingsStore';
import type { CustomPlanState } from '../../model/customPlan';
import type { ListKey } from '../../navigation/shellState';
import { IconBadge, Pill, Surface, UIText } from '../../ui/primitives';
import { palette, radius, shadow, space, useTheme } from '../../ui/theme';

export interface CheckSettingsPanelProps {
  enabled: EnabledLists;
  customPlan: CustomPlanState | null;
  onToggle: (key: ListKey, enabled: boolean) => void;
  onOpenCustom: () => void;
  onDeleteCustom: () => void;
  onClose: () => void;
}

export function CheckSettingsPanel({
  enabled,
  customPlan,
  onToggle,
  onOpenCustom,
  onDeleteCustom,
  onClose
}: CheckSettingsPanelProps): React.JSX.Element {
  const { feature } = useTheme();

  const confirmDelete = (): void => {
    Alert.alert('删除自定义清单', '删除后当前自定义清单的进度和成就也会一并清除。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: onDeleteCustom }
    ]);
  };

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
      <Surface style={styles.sheet} padding={0} radiusValue={radius.xl}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <UIText variant="h2">清单管理</UIText>
            <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
              开关内置清单，管理自定义清单
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
          {BUILTIN_LIST_KEYS.map((key) => {
            const item = CHECKLISTS[key];
            const color = feature[key];
            const value = enabled[key] !== false;
            return (
              <View key={key} style={styles.row}>
                <IconBadge icon={item.icon} accent={color.main} size={32} />
                <View style={{ flex: 1 }}>
                  <UIText variant="bodyStrong">{item.name}</UIText>
                  <UIText variant="caption" tone="muted">
                    {item.tagline}
                  </UIText>
                </View>
                <Switch
                  value={value}
                  onValueChange={(next) => onToggle(key, next)}
                  trackColor={{ false: palette.line, true: `${color.main}66` }}
                  thumbColor={value ? color.main : palette.faint}
                />
              </View>
            );
          })}

          <View style={styles.sectionSpacer} />
          <UIText variant="caption" tone="muted" style={styles.sectionLabel}>
            自定义清单
          </UIText>
          {customPlan ? (
            <View style={styles.customCard}>
              <View style={styles.row}>
                <IconBadge icon={customPlan.plan.icon} accent={feature.custom.main} size={34} />
                <View style={{ flex: 1 }}>
                  <UIText variant="bodyStrong">{customPlan.plan.title}</UIText>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
                    <Pill
                      label={customPlan.plan.mode === 'deadline' ? '截止性' : '重复性'}
                      accent={feature.custom.main}
                      tone="tint"
                    />
                    <Pill label={`${customPlan.plan.skills.length} 个技能`} accent={feature.custom.main} tone="outline" />
                  </View>
                </View>
              </View>
              <View style={styles.customActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenCustom}
                  style={[styles.actionButton, { backgroundColor: feature.custom.tint }]}
                >
                  <UIText variant="caption" color={feature.custom.deep} style={{ fontWeight: '700' }}>
                    打开清单
                  </UIText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={confirmDelete}
                  style={[styles.actionButton, { backgroundColor: palette.dangerTint }]}
                >
                  <UIText variant="caption" color={palette.danger} style={{ fontWeight: '700' }}>
                    删除
                  </UIText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCustom}>
              <UIText variant="bodyStrong">还没有自定义清单</UIText>
              <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
                可以创建重复性或截止性清单。
              </UIText>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenCustom}
                style={[styles.createButton, { backgroundColor: feature.custom.main }]}
              >
                <UIText variant="caption" color="#FFFFFF" style={{ fontWeight: '800' }}>
                  去创建
                </UIText>
              </Pressable>
            </View>
          )}
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
    maxHeight: '82%',
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
  sectionSpacer: {
    height: 12
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  customCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: palette.surfaceAlt
  },
  customActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.sm
  },
  emptyCustom: {
    borderWidth: 1,
    borderColor: palette.line,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: palette.surfaceAlt
  },
  createButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: 10
  }
});
