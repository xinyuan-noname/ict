import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { FrameItem } from '../api/rewardsApi';
import { AvatarFrameView } from '../components/AvatarFrameView';
import type { RewardsSnapshot, RewardsStore } from '../rewards/rewardsStore';
import { businessToday } from '../model/waterGoal';
import { AppButton, HeaderBar, PageScroll, Pill, SectionHeader, Surface, UIText } from '../ui/primitives';
import { palette, radius } from '../ui/theme';

export interface RewardsScreenProps {
  store: RewardsStore;
  avatarUrl?: string;
  onBack: () => void;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function RewardsScreen({ store, avatarUrl, onBack }: RewardsScreenProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<RewardsSnapshot>(store.getSnapshot());

  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    if (!snapshot.status && !snapshot.loading) {
      void store.load();
    }
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const status = snapshot.status;
  const catalog = snapshot.catalog;
  const equipped = catalog?.frames.find((frame) => frame.equipped);
  const streak = Math.min(status?.streakDays ?? 0, 7);
  const todayIndex = (new Date(`${businessToday()}T00:00:00Z`).getUTCDay() || 7) - 1;
  const activeDays = new Set(Array.from({ length: streak }, (_, index) => (todayIndex - index + 7) % 7));

  return (
    <View style={styles.root}>
      <HeaderBar title="签到与奖励" subtitle="每日一点，积累成就感" onBack={onBack} />
      <PageScroll contentStyle={{ paddingTop: 4 }}>
        <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden', backgroundColor: palette.brand }}>
          <View style={styles.heroDecorA} />
          <View style={styles.heroDecorB} />
          <View style={{ padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <UIText variant="label" color="rgba(255,255,255,0.66)">
                CHECK-IN STREAK
              </UIText>
              <Pill
                label={status?.checkedIn ? '今日已签到' : '今天还没签到'}
                accent={palette.white}
                tone="outline"
                dot
                style={{ borderColor: 'rgba(255,255,255,0.32)' }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <AvatarFrameView avatarUrl={avatarUrl} frameAssetUrl={equipped?.assetUrl ?? null} size={62} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <UIText variant="display" color={palette.white} style={{ fontSize: 42, lineHeight: 46 }}>
                    {status?.pointsBalance ?? 0}
                  </UIText>
                  <UIText variant="small" color="rgba(255,255,255,0.7)">
                    积分
                  </UIText>
                </View>
                <UIText variant="caption" color="rgba(255,255,255,0.72)" style={{ marginTop: 2 }}>
                  连续签到 {status?.streakDays ?? 0} 天 · {status?.timezone ?? 'Asia/Shanghai'}
                </UIText>
              </View>
            </View>

            <View style={styles.weekRow}>
              {WEEK_LABELS.map((label, index) => {
                const done = activeDays.has(index);
                const isToday = index === todayIndex;
                return (
                  <View key={label} style={{ alignItems: 'center', flex: 1, gap: 5 }}>
                    <View
                      style={[
                        styles.dayDot,
                        done && styles.dayDotDone,
                        isToday && styles.dayDotToday
                      ]}
                    >
                      <UIText variant="caption" color={done ? palette.brand : 'rgba(255,255,255,0.52)'} style={{ fontWeight: '700' }}>
                        {done ? '✓' : label}
                      </UIText>
                    </View>
                    <UIText variant="caption" color={isToday ? palette.white : 'rgba(255,255,255,0.45)'} style={{ fontSize: 9 }}>
                      {label}
                    </UIText>
                  </View>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              testID="checkin-button"
              disabled={snapshot.checkingIn || !status || status.checkedIn}
              onPress={() => void store.checkIn()}
              style={({ pressed }) => [
                styles.checkIn,
                (status?.checkedIn || snapshot.checkingIn) && styles.checkInDisabled,
                pressed && { opacity: 0.84 }
              ]}
            >
              {snapshot.checkingIn ? (
                <ActivityIndicator color={palette.brand} size="small" />
              ) : (
                <UIText variant="bodyStrong" color={palette.brand}>
                  {status?.checkedIn ? '今日已签到，明天再来' : `签到 +${status?.todayReward ?? 10} 积分`}
                </UIText>
              )}
            </Pressable>
          </View>
        </Surface>

        {snapshot.errorMessage ? (
          <Surface tone="soft" style={{ marginTop: 12, backgroundColor: palette.dangerTint, borderColor: `${palette.danger}26` }}>
            <UIText variant="small" color={palette.danger}>
              {snapshot.errorMessage}
            </UIText>
            {snapshot.errorCode ? (
              <UIText variant="caption" tone="muted" style={{ marginTop: 3 }}>
                {snapshot.errorCode}
              </UIText>
            ) : null}
          </Surface>
        ) : null}
        {snapshot.notice ? (
          <Surface tone="soft" style={{ marginTop: 12, backgroundColor: palette.successTint, borderColor: `${palette.success}26` }}>
            <UIText variant="small" color={palette.success}>
              {snapshot.notice}
            </UIText>
          </Surface>
        ) : null}

        <SectionHeader
          title="像素头像框"
          caption="用积分兑换，随时装备或卸下"
          actionLabel={equipped ? `已装备 ${equipped.name}` : undefined}
          style={{ marginTop: 22 }}
        />

        {snapshot.loading && !catalog ? (
          <Surface tone="soft" style={{ alignItems: 'center', paddingVertical: 28 }}>
            <ActivityIndicator color={palette.brand} />
            <UIText variant="caption" tone="muted" style={{ marginTop: 8 }}>
              正在加载头像框…
            </UIText>
          </Surface>
        ) : (
          <View style={styles.frameGrid}>
            {(catalog?.frames ?? []).map((frame) => (
              <FrameCard
                key={frame.frameId}
                frame={frame}
                redeeming={snapshot.redeemingFrameId === frame.frameId}
                onRedeem={() => void store.redeem(frame.frameId)}
                onEquip={() => void store.equip(frame.equipped ? null : frame.frameId)}
              />
            ))}
          </View>
        )}

        <Surface tone="soft" style={{ marginTop: 18 }}>
          <UIText variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            签到按服务端时区判定；积分、头像框与装备状态以云端账本为准。游客模式不参与签到与积分。
          </UIText>
        </Surface>
      </PageScroll>
    </View>
  );
}

function FrameCard({
  frame,
  redeeming,
  onRedeem,
  onEquip
}: {
  frame: FrameItem;
  redeeming: boolean;
  onRedeem: () => void;
  onEquip: () => void;
}): React.JSX.Element {
  return (
    <Surface
      testID={`frame-${frame.frameId}`}
      padding={12}
      radiusValue={radius.md}
      style={[styles.frameCard, frame.equipped && { borderColor: palette.brand, backgroundColor: palette.brandTint }]}
    >
      <View style={styles.framePreview}>
        <AvatarFrameView frameAssetUrl={frame.assetUrl} size={66} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <UIText variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
          {frame.name}
        </UIText>
        {frame.equipped ? <Pill label="使用中" accent={palette.brand} tone="solid" /> : null}
      </View>
      <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {frame.price === 0 ? '免费' : `${frame.price} 积分`}
      </UIText>
      {frame.owned ? (
        <AppButton
          label={frame.equipped ? '卸下' : '装备'}
          onPress={onEquip}
          variant={frame.equipped ? 'ghost' : 'soft'}
          accent={palette.brand}
          size="sm"
          fullWidth
          style={{ marginTop: 8 }}
        />
      ) : (
        <AppButton
          label={redeeming ? '兑换中…' : frame.status === 'off_shelf' ? '已下架' : '兑换'}
          onPress={onRedeem}
          disabled={!frame.purchasable || redeeming}
          variant="secondary"
          accent={palette.brand}
          size="sm"
          fullWidth
          style={{ marginTop: 8 }}
        />
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  heroDecorA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -120,
    right: -90
  },
  heroDecorB: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0,0,0,0.10)',
    bottom: -90,
    left: -40
  },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 16 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayDotDone: { backgroundColor: palette.white, borderColor: palette.white },
  dayDotToday: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  checkIn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkInDisabled: { backgroundColor: 'rgba(255,255,255,0.45)' },
  frameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  frameCard: { flexBasis: '47%', flexGrow: 1, minWidth: 148, alignItems: 'stretch' },
  framePreview: {
    height: 82,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
