import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface State {
  error: Error | null;
}

// 渲染期错误兜底：三端通用，Web 上避免白屏
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 保留控制台输出，便于定位
    console.error('[AppError]', error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>页面渲染失败</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.stack}>{this.state.error.stack ?? ''}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 16, fontWeight: '600', color: '#a61b1b', marginBottom: 10 },
  message: { fontSize: 13, color: '#333', marginBottom: 10 },
  stack: { fontSize: 10, color: '#888', lineHeight: 15 }
});