import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { userMessageFor } from '../shared/errorCatalog';

export interface LoginScreenProps {
  loading: boolean;
  errorCode?: string;
  errorMessage?: string;
  traceId?: string;
  onLogin: () => void;
}

// 仅一个"华为账号登录"按钮，无账号密码输入（任务 33.1）。
export function LoginScreen({ loading, errorCode, errorMessage, traceId, onLogin }: LoginScreenProps): React.JSX.Element {
  const message = errorMessage ?? (errorCode ? userMessageFor(errorCode) : undefined);
  const showCode = errorCode !== undefined && errorCode !== 'AUTH_002';
  return (
    <View style={styles.container}>
      <Text style={styles.title}>华为账号登录</Text>
      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
          {showCode ? <Text style={styles.codeText}>{errorCode}</Text> : null}
          {traceId ? <Text style={styles.codeText}>traceId: {traceId}</Text> : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={onLogin}
        style={[styles.button, loading && styles.buttonDisabled]}
      >
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>华为账号登录</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 32 },
  banner: { backgroundColor: '#fdecec', borderRadius: 8, padding: 12, marginBottom: 16, width: '100%' },
  bannerText: { color: '#a61b1b', fontSize: 14 },
  codeText: { color: '#7a7a7a', fontSize: 12, marginTop: 4 },
  button: { backgroundColor: '#c7000b', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 48 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' }
});