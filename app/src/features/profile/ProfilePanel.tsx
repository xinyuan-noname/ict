import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { showDialog } from '../../components/AppDialog';
import { DatePickerModal } from '../../components/DatePickerModal';
import type { CheckSnapshot, CheckStore } from '../../check/checkStore';
import { ageFromBirthDate, businessToday, formatML, type Gender } from '../../model/waterGoal';
import { AppAvatar, AppButton, Divider, ListRow, PageScroll, Pill, SectionHeader, Surface, UIText } from '../../ui/primitives';
import { palette, radius, useTheme } from '../../ui/theme';

const GENDERS: { key: Gender; label: string; icon: string }[] = [
  { key: 'male', label: '男', icon: '♂' },
  { key: 'female', label: '女', icon: '♀' },
  { key: 'other', label: '其他', icon: '○' }
];

function genderLabel(gender: Gender | ''): string {
  return GENDERS.find((item) => item.key === gender)?.label ?? '未填写';
}

export function ProfilePanel({
  snapshot,
  store,
  isGuest,
  displayName,
  onUpgrade,
  onExit,
  onOpenRewards,
  onSync,
  onOpenSystem
}: {
  snapshot: CheckSnapshot;
  store: CheckStore;
  isGuest: boolean;
  displayName: string;
  onUpgrade?: () => void;
  onExit: () => void;
  onOpenRewards?: () => void;
  onSync?: () => void;
  onOpenSystem?: () => void;
}): React.JSX.Element {
  const { feature } = useTheme();
  const [height, setHeight] = useState(snapshot.profile ? String(snapshot.profile.heightCm) : '');
  const [weight, setWeight] = useState(snapshot.profile ? String(Math.round(snapshot.profile.weightG / 1000)) : '');
  const [birthDate, setBirthDate] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [gender, setGender] = useState<Gender | ''>(snapshot.profile?.gender ?? '');
  const [editing, setEditing] = useState(false);
  const age = birthDate ? ageFromBirthDate(birthDate, businessToday()) : snapshot.profile?.age ?? null;

  useEffect(() => {
    if (!snapshot.profile) {
      return;
    }
    setHeight(String(snapshot.profile.heightCm));
    setWeight(String(Math.round(snapshot.profile.weightG / 1000)));
    setGender(snapshot.profile.gender);
  }, [snapshot.profile]);

  const save = async (): Promise<void> => {
    const computedAge = birthDate ? ageFromBirthDate(birthDate, businessToday()) : snapshot.profile?.age ?? null;
    if (!height || !weight || computedAge === null || !gender) {
      showDialog({ title: '请完善档案', message: '身高、体重、出生日期与性别都需要填写' });
      return;
    }
    await store.saveProfile({
      heightCm: Number(height),
      weightG: Number(weight) * 1000,
      age: computedAge,
      gender
    });
    setEditing(false);
  };

  return (
    <>
      <PageScroll>
        <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden' }}>
          <View style={{ backgroundColor: palette.brandTint, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <AppAvatar name={displayName} size={58} accent={palette.brand} ring />
              <View style={{ flex: 1, minWidth: 0 }}>
                <UIText variant="h2" numberOfLines={1}>
                  {displayName}
                </UIText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <Pill label={isGuest ? '游客模式' : '华为账号'} accent={isGuest ? palette.muted : palette.brand} />
                  <Pill label={isGuest ? '本地保存' : '云端同步'} accent={isGuest ? palette.muted : palette.success} tone="outline" />
                </View>
              </View>
            </View></View>
        </Surface>

        <SectionHeader
          title="身体档案"
          caption={snapshot.profile ? '目标量依据档案自动计算，变更次日生效' : '填写后自动计算每日饮水目标'}
          actionLabel={editing ? '收起' : snapshot.profile ? '修改' : undefined}
          onAction={editing || snapshot.profile ? () => setEditing((value) => !value) : undefined}
          style={{ marginTop: 22 }}
        />

        {!editing && snapshot.profile ? (
          <Surface>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ProfileMetric label="身高" value={`${snapshot.profile.heightCm}`} unit="cm" />
              <ProfileMetric label="体重" value={`${Math.round(snapshot.profile.weightG / 1000)}`} unit="kg" />
              <ProfileMetric label="年龄" value={`${snapshot.profile.age}`} unit="岁" />
              <ProfileMetric label="性别" value={genderLabel(snapshot.profile.gender)} unit="" />
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <UIText variant="small" tone="muted">
                每日建议饮水
              </UIText>
              <UIText variant="bodyStrong" color={feature.water.deep}>
                {snapshot.targetMl > 0 ? formatML(snapshot.targetMl) : '待计算'}
              </UIText>
            </View>
          </Surface>
                ) : !editing ? (
          <Surface>
            <UIText variant="bodyStrong">还没有身体档案</UIText>
            <UIText variant="small" tone="muted" style={{ marginTop: 4, lineHeight: 19 }}>
              填写身高、体重、出生日期和性别后，自动计算每日建议饮水量。
            </UIText>
            <AppButton
              label="去完善"
              fullWidth
              onPress={() => setEditing(true)}
              style={{ marginTop: 12 }}
              testID="complete-profile"
            />
          </Surface>
        ) : (
          <Surface>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ProfileField label="身高" unit="cm" value={height} onChange={setHeight} />
              <ProfileField label="体重" unit="kg" value={weight} onChange={setWeight} />
            </View>
            <View style={styles.field}>
              <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
                出生日期
              </UIText>
              <Pressable
                accessibilityRole="button"
                testID="birth-date"
                onPress={() => setDatePickerOpen(true)}
                style={styles.dateField}
              >
                <UIText variant={birthDate ? 'bodyStrong' : 'small'} tone={birthDate ? 'ink' : 'faint'}>
                  {birthDate || 'YYYY-MM-DD'}
                </UIText>
                <UIText variant="caption" tone="faint">
                  {age !== null ? `${age} 岁` : '选择'}
                </UIText>
              </Pressable>
            </View>
            <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
              性别
            </UIText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {GENDERS.map((item) => {
                const active = gender === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={() => setGender(item.key)}
                    style={[
                      styles.gender,
                      active && { borderColor: palette.brand, backgroundColor: palette.brandTint }
                    ]}
                  >
                    <UIText variant="small" color={active ? palette.brand : palette.muted} style={{ fontWeight: active ? '700' : '500' }}>
                      {item.icon} {item.label}
                    </UIText>
                  </Pressable>
                );
              })}
            </View>
            <UIText variant="caption" tone="faint" style={{ marginTop: 10, lineHeight: 17 }}>
              {age === null ? '填写出生日期后自动计算年龄' : `年龄：${age} 岁`} · 目标量 = 体重与标准体重加权 × 年龄/性别系数，仅供参考。
            </UIText>
            <AppButton
              label="保存档案"
              fullWidth
              onPress={() => void save()}
              style={{ marginTop: 12 }}
              testID="save-profile"
            />
            {snapshot.profile ? (
              <AppButton label="取消修改" variant="ghost" onPress={() => setEditing(false)} style={{ marginTop: 2 }} />
            ) : null}
          </Surface>
        )}

        <SectionHeader title="数据与同步" style={{ marginTop: 22 }} />
        <Surface padding={4}>
          <ListRow
            icon={isGuest ? '📱' : '☁️'}
            title={isGuest ? '本机存储' : '云端同步已开启'}
            subtitle={isGuest ? '游客数据不会上传服务器' : '运动记录、成就与积分以服务端为准'}
            accent={isGuest ? palette.muted : palette.success}
          />
          {!isGuest && onSync ? (
            <ListRow
              icon="↻"
              title="立即同步"
              subtitle="把本地记录推送到云端并对账"
              accent={feature.water.main}
              onPress={onSync}
              right={<UIText variant="bodyStrong" tone="faint">›</UIText>}
              last
            />
          ) : null}
          {isGuest && onUpgrade ? (
            <ListRow
              icon="🔐"
              title="登录华为账号"
              subtitle="开启云端同步与多端数据"
              accent={palette.brand}
              onPress={onUpgrade}
              right={<UIText variant="bodyStrong" tone="faint">›</UIText>}
              last
            />
          ) : null}
        </Surface>

        {!isGuest && onOpenRewards ? (
          <>
            <SectionHeader title="积分与奖励" style={{ marginTop: 22 }} />
            <Surface padding={4}>
              <ListRow
                icon="🎁"
                title="签到与头像框"
                subtitle="每日签到领积分，解锁像素头像框"
                accent={palette.brand}
                onPress={onOpenRewards}
                right={<UIText variant="bodyStrong" tone="faint">›</UIText>}
                last
              />
            </Surface>
          </>
        ) : null}

        {onOpenSystem ? (
          <>
            <SectionHeader title="演示与架构" style={{ marginTop: 22 }} />
            <Surface padding={4}>
              <ListRow
                icon="☁️"
                title="系统与云端"
                subtitle="RDS / Redis / CodeArts 部署状态"
                accent={feature.water.main}
                onPress={onOpenSystem}
                right={<UIText variant="bodyStrong" tone="faint">›</UIText>}
                last
              />
            </Surface>
          </>
        ) : null}

        <SectionHeader title="账号" style={{ marginTop: 22 }} />
        <Surface padding={4}>
          <ListRow
            icon={isGuest ? '👤' : '🪪'}
            title={isGuest ? '游客身份' : '华为账号'}
            subtitle={isGuest ? '退出后本机游客数据仍会保留' : '会话失效后需要重新授权'}
            accent={isGuest ? palette.muted : palette.brand}
            last
          />
          <ListRow
            icon="↩"
            title={isGuest ? '退出游客模式' : '退出登录'}
            subtitle="不会删除历史记录"
            accent={palette.danger}
            onPress={() =>
              showDialog({
                title: isGuest ? '退出游客模式' : '退出登录',
                message: '确定退出？',
                confirmText: '退出',
                destructive: true,
                onConfirm: onExit
              })
            }
            last
          />
        </Surface>

        <UIText variant="caption" tone="faint" align="center" style={{ marginTop: 22, lineHeight: 17 }}>
          check · 每日健康清单{'\n'}目标量仅作日常参考，不构成医学建议。
        </UIText>
      </PageScroll>

      <DatePickerModal
        visible={datePickerOpen}
        value={birthDate}
        onCancel={() => setDatePickerOpen(false)}
        onConfirm={(picked) => {
          setBirthDate(picked);
          setDatePickerOpen(false);
        }}
      />
    </>
  );
}


function ProfileMetric({ label, value, unit }: { label: string; value: string; unit: string }): React.JSX.Element {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <UIText variant="h2">{value}</UIText>
        {unit ? (
          <UIText variant="caption" tone="muted">
            {unit}
          </UIText>
        ) : null}
      </View>
      <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {label}
      </UIText>
    </View>
  );
}

function ProfileField({
  label,
  unit,
  value,
  onChange
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <View style={{ flex: 1 }}>
      <UIText variant="caption" tone="muted" style={styles.fieldLabel}>
        {label} {unit}
      </UIText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel={`${label} ${unit}`}
        placeholder="—"
        placeholderTextColor={palette.faint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12 },
  fieldLabel: { marginBottom: 5, fontWeight: '700' },
  dateField: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  gender: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 9,
    alignItems: 'center'
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: palette.ink
  }
});
