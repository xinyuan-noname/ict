import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrameItem } from '../api/rewardsApi';
import { AvatarFrameView } from '../components/AvatarFrameView';
import type { RewardsSnapshot, RewardsStore } from '../rewards/rewardsStore';

export interface RewardsScreenProps {
  store: RewardsStore;
  avatarUrl?: string;
  onBack: () => void;
}

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
  const equipped = catalog?.frames.find((f) => f.equipped);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.title}>每日签到</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.summary}>
        <AvatarFrameView avatarUrl={avatarUrl} frameAssetUrl={equipped?.assetUrl ?? null} size={72} />
        <View style={styles.summaryText}>
          <Text style={styles.points}>{status?.pointsBalance ?? 0} 积分</Text>
          <Text style={styles.meta}>连续签到 {status?.streakDays ?? 0} 天</Text>
          <Text style={styles.meta}>{status?.timezone ?? 'Asia/Shanghai'}</Text>
        </View>
      </View>

      {snapshot.errorMessage ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{snapshot.errorMessage}</Text>
          {snapshot.errorCode ? <Text style={styles.code}>{snapshot.errorCode}</Text> : null}
        </View>
      ) : null}
      {snapshot.notice ? <Text style={styles.notice}>{snapshot.notice}</Text> : null}

      <Pressable
        accessibilityRole="button"
        testID="checkin-button"
        disabled={snapshot.checkingIn || !status || status.checkedIn}
        onPress={() => void store.checkIn()}
        style={[styles.checkIn, (status?.checkedIn || snapshot.checkingIn) && styles.checkInDisabled]}
      >
        {snapshot.checkingIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.checkInText}>
            {status?.checkedIn ? '今日已签到' : `签到 +${status?.todayReward ?? 10} 积分`}
          </Text>
        )}
      </Pressable>

      <Text style={styles.sectionTitle}>像素头像框</Text>
      {snapshot.loading && !catalog ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={catalog?.frames ?? []}
          keyExtractor={(item) => item.frameId}
          numColumns={2}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FrameCard
              frame={item}
              redeeming={snapshot.redeemingFrameId === item.frameId}
              onRedeem={() => void store.redeem(item.frameId)}
              onEquip={() => void store.equip(item.equipped ? null : item.frameId)}
            />
          )}
        />
      )}
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
    <View style={styles.card} testID={`frame-${frame.frameId}`}>
      <AvatarFrameView frameAssetUrl={frame.assetUrl} size={64} />
      <Text style={styles.cardName}>{frame.name}</Text>
      <Text style={styles.cardPrice}>{frame.price === 0 ? '免费' : `${frame.price} 积分`}</Text>
      {frame.owned ? (
        <Pressable accessibilityRole="button" onPress={onEquip} style={styles.cardButton}>
          <Text style={styles.cardButtonText}>{frame.equipped ? '卸下' : '装备'}</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={!frame.purchasable || redeeming}
          onPress={onRedeem}
          style={[styles.cardButton, !frame.purchasable && styles.cardButtonDisabled]}
        >
          <Text style={styles.cardButtonText}>{redeeming ? '兑换中…' : frame.status === 'off_shelf' ? '已下架' : '兑换'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  back: { width: 48 },
  backText: { color: '#666', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '600', color: '#222' },
  summary: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  summaryText: { marginLeft: 16 },
  points: { fontSize: 24, fontWeight: '700', color: '#c7000b' },
  meta: { color: '#666', fontSize: 13, marginTop: 2 },
  banner: { backgroundColor: '#fdecec', borderRadius: 8, padding: 10, marginBottom: 8 },
  bannerText: { color: '#a61b1b', fontSize: 14 },
  code: { color: '#7a7a7a', fontSize: 12, marginTop: 2 },
  notice: { color: '#1a7a3c', fontSize: 14, marginBottom: 8 },
  checkIn: { backgroundColor: '#c7000b', borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  checkInDisabled: {backgroundColor: '#d9d9d9' },
  checkInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8, color: '#333' },
  list: { paddingBottom: 24 },
  card: { width: '48%', backgroundColor: '#fafafa', borderRadius: 12, padding: 12, margin: '1%', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '600', marginTop: 8, color: '#333' },
  cardPrice: { fontSize: 13, color: '#888', marginTop: 2 },
  cardButton: { marginTop: 8, backgroundColor: '#fff', borderColor: '#c7000b', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6 },
  cardButtonDisabled: { borderColor: '#ccc' },
  cardButtonText: { color: '#c7000b', fontSize: 13 }
});