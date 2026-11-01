import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserBrief } from '../api/authApi';

export interface HomeScreenProps {
  user: UserBrief | null;
  platform: string;
  onLogout: () => void;
  onRefresh: () => Promise<UserBrief | null>;
}

// 受保护页面：仅 authenticated 状态挂载（任务 33.2/32.5）。
export function HomeScreen({ user, platform, onLogout, onRefresh }: HomeScreenProps): React.JSX.Element {
  const [current, setCurrent] = useState<UserBrief | null>(user);

  useEffect(() => {
    setCurrent(user);
  }, [user]);

  const refresh = async (): Promise<void> => {
    const next = await onRefresh();
    if (next) {
      setCurrent(next);
    }
  };

  return (
    <View style={styles.container}>
      {current?.avatarUrl ? (
        <Image source={{ uri: current.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>华为</Text>
        </View>
      )}
      <Text style={styles.name}>{current?.displayName || '华为账号用户'}</Text>
      <Text style={styles.meta}>平台：{platform}</Text>
      <Text style={styles.meta}>用户标识：{current?.userId ?? '-'}</Text>
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={refresh}>
        <Text style={styles.secondaryText}>刷新资料</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.danger} onPress={onLogout}>
        <Text style={styles.dangerText}>退出登录</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 16 },
  avatarPlaceholder: { backgroundColor: '#c7000b', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20 },
  name: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  meta: { color: '#666', fontSize: 14, marginBottom: 6 },
  secondary: { marginTop: 24, padding: 12 },
  secondaryText: { color: '#c7000b', fontSize: 15 },
  danger: { marginTop: 8, padding: 12 },
  dangerText: { color: '#999', fontSize: 15 }
});