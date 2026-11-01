import { Platform } from 'react-native';
import type { Platform as AuthPlatform } from '../api/authApi';

export const APP_VERSION = '1.0.0';
export const APP_ENV = __DEV__ ? 'development' : 'production';

// Android 模拟器通过 10.0.2.2 访问宿主机；其余平台使用回环地址。
export function defaultBaseUrl(): string {
  if (__DEV__ && Platform.OS === 'android') {
    return 'http://10.0.2.2:8443';
  }
  if (__DEV__) {
    return 'http://127.0.0.1:8443';
  }
  return 'https://api.example.com';
}

export function currentPlatform(): AuthPlatform {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'windows') {
    return 'windows';
  }
  return 'android';
}

export const WINDOWS_REDIRECT_URI = 'http://127.0.0.1:17890/callback';

declare const __DEV__: boolean;