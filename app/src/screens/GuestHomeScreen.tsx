import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../components/AppDialog';
import { GUEST_COPY } from '../guest/types';

export interface GuestHomeScreenProps {
  displayName: string;
  onUpgrade: () => void;
  onExit: () => void;
}

// 游客主页独立组件：结构上与认证态主页隔离，签到/积分/商城入口不渲染。
export function GuestHomeScreen({ displayName, onUpgrade, onExit }: GuestHomeScreenProps): React.JSX.Element {
  const confirmExit = (): void => {
    showDialog({
      title: '退出游客模式',
      message: GUEST_COPY.confirmExit,
      confirmText: '退出',
      destructive: true,
      onConfirm: onExit
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <View style={styles.pixelRow}>
          <View style={styles.pixel} />
          <View style={styles.pixelDim} />
          <View style={styles.pixel} />
        </View>
        <View style={styles.pixelRow}>
          <View style={styles.pixelDim} />
          <View style={styles.pixel} />
          <View style={styles.pixelDim} />
        </View>
        <View style={styles.pixelRow}>
          <View style={styles.pixel} />
          <View style={styles.pixelDim} />
          <View style={styles.pixel} />
        </View>
      </View>

      <Text style={styles.name}>{displayName}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{GUEST_COPY.badge}</Text>
      </View>
      <Text style={styles.local}>{GUEST_COPY.localOnly}</Text>

      <Pressable accessibilityRole="button" testID="guest-upgrade" style={styles.primary} onPress={onUpgrade}>
        <Text style={styles.primaryText}>{GUEST_COPY.upgrade}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" testID="guest-exit" style={styles.ghost} onPress={confirmExit}>
        <Text style={styles.ghostText}>{GUEST_COPY.exit}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#c7000b', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pixelRow: { flexDirection: 'row' },
  pixel: { width: 8, height: 8, margin: 1, backgroundColor: '#ffffff' },
  pixelDim: { width: 8, height: 8, margin: 1, backgroundColor: '#ffb3b8' },
  name: { fontSize: 22, fontWeight: '600', marginBottom: 8, color: '#222' },
  badge: { backgroundColor: '#fff1f0', borderColor: '#c7000b', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 },
  badgeText: { color: '#c7000b', fontSize: 12 },
  local: { color: '#888', fontSize: 12, marginBottom: 28, textAlign: 'center' },
  primary: { backgroundColor: '#c7000b', borderRadius: 24, paddingVertical: 13, paddingHorizontal: 40 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghost: { marginTop: 10, padding: 12 },
  ghostText: { color: '#999', fontSize: 15 }
});