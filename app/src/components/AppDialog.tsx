import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

let emitter: ((options: DialogOptions | null) => void) | null = null;

// 命令式对话框，替代 Web 上不可用的 Alert.alert
export function showDialog(options: DialogOptions): void {
  if (emitter) {
    emitter(options);
    return;
  }
  // 极端情况下没有挂载宿主：直接执行确认回调，避免交互卡死
  options.onConfirm?.();
}

export function AppDialogHost(): React.JSX.Element {
  const [options, setOptions] = useState<DialogOptions | null>(null);

  useEffect(() => {
    emitter = setOptions;
    return () => {
      emitter = null;
    };
  }, []);

  const close = (): void => setOptions(null);

  return (
    <Modal visible={options !== null} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.mask} onPress={close}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>{options?.title ?? ''}</Text>
          {options?.message ? <Text style={styles.message}>{options.message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancel]}
              onPress={() => {
                const cb = options?.onCancel;
                close();
                cb?.();
              }}
            >
              <Text style={styles.cancelText}>{options?.cancelText ?? '取消'}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, options?.destructive ? styles.destructive : styles.confirm]}
              onPress={() => {
                const cb = options?.onConfirm;
                close();
                cb?.();
              }}
            >
              <Text style={styles.confirmText}>{options?.confirmText ?? '确定'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  title: { fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 8 },
  message: { fontSize: 13, color: '#666', lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18, gap: 10 },
  button: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  cancel: { backgroundColor: '#f3f3f3' },
  cancelText: { color: '#666', fontSize: 13 },
  confirm: { backgroundColor: '#c7000b' },
  destructive: { backgroundColor: '#c7000b' },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '600' }
});