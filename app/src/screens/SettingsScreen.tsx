import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { APP_ENV, APP_VERSION } from '../shared/config';

export interface SettingsScreenProps {
  serverVersion?: string;
  traceId?: string;
}

// 供问题反馈：展示版本、环境、服务端版本与当前 traceId（任务 33.3）。
export function SettingsScreen({ serverVersion, traceId }: SettingsScreenProps): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.row}>客户端版本：{APP_VERSION}</Text>
      <Text style={styles.row}>运行环境：{APP_ENV}</Text>
      <Text style={styles.row}>服务端版本：{serverVersion ?? '未获取'}</Text>
      <Text style={styles.row}>traceId：{traceId ?? '暂无'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  row: { fontSize: 15, marginBottom: 12, color: '#333' }
});