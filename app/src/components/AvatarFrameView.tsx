import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export interface AvatarFrameViewProps {
  avatarUrl?: string;
  frameAssetUrl?: string | null;
  size?: number;
  scale?: 1 | 2 | 3;
}

// 双层渲染：底层头像 + 上层像素框；最近整数倍变体保证像素锐利。
export function AvatarFrameView({
  avatarUrl,
  frameAssetUrl,
  size = 88,
  scale = 3
}: AvatarFrameViewProps): React.JSX.Element {
  const frameUri = frameAssetUrl
    ? frameAssetUrl.replace(/\.png$/, `-${scale}x.png`)
    : undefined;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatarClip, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} />
        ) : (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>华为</Text>
          </View>
        )}
      </View>
      {frameUri ? (
        <Image
          source={{ uri: frameUri }}
          style={[styles.frame, { width: size, height: size }]}
          resizeMode="contain"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarClip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#c7000b' },
  fallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontSize: 16 },
  frame: { position: 'absolute', left: 0, top: 0 }
});