import { Platform } from 'react-native';
import type { Platform as AuthPlatform } from '../api/authApi';

export const APP_VERSION = '1.0.0';
export const APP_ENV = __DEV__ ? 'development' : 'production';

// 生产构建必须改成实际部署的 HTTPS 域名（华为云 ECS / 网关）。
// 未改时华为授权码能拿到，但客户端无法把 code 交给服务端换票。
export const PRODUCTION_API_BASE_URL = 'https://api.example.com';

// 本机联调：手机与电脑同一局域网时，填电脑的局域网 IPv4。
// 真机调试要配合 authd 监听 :8443，且 Debug 构建允许 http。
export const DEV_ANDROID_API_BASE_URL = 'http://192.168.137.1:8443';

// Android 模拟器通过 10.0.2.2 访问宿主机；真机联调使用上面的局域网地址。
export function defaultBaseUrl(): string {
  if (__DEV__ && Platform.OS === 'android') {
    return DEV_ANDROID_API_BASE_URL;
  }
  if (__DEV__) {
    return 'http://127.0.0.1:8443';
  }
  return PRODUCTION_API_BASE_URL;
}

// Web 端一律同源请求：开发态由 webpack devServer 的 /v1 代理转发到 authd，
// 生产态由网关把 /v1 反代到服务端，避免浏览器跨域被 CORS 拦截。
export function clientBaseUrl(): string {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    if (origin && origin !== 'null' && /^https?:\/\//.test(origin)) {
      return origin;
    }
  }
  return defaultBaseUrl();
}

// 与 clientBaseUrl 配套：生产 Web 仅放行本机回环的 http（本地预览），其余必须 https。
export function clientAllowInsecure(): boolean {
  if (__DEV__) {
    return true;
  }
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return false;
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

// 真实模式授权端点必须精确等于官方地址，禁止镜像/代理（spec 5.3.4）。
export const OFFICIAL_HUAWEI_AUTHORIZE_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize';

export function assertOfficialAuthorizeUrl(url: string): void {
  if (url.replace(/\/+$/, '') !== OFFICIAL_HUAWEI_AUTHORIZE_URL) {
    throw new Error('authorizeUrl must be the official Huawei endpoint');
  }
}