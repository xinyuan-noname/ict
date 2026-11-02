// 游客模式常量与类型（与 spec 6 章、design 2.x 对齐）。

export const GUEST_PROFILE_KEY = 'guest.profile.v1';
export const GUEST_SCHEMA_VERSION = 1;
export const GUEST_PROFILE_MAX_BYTES = 2048;
export const GUEST_ID_PREFIX = 'guest_';
export const GUEST_DISPLAY_NAME = '游客';

export interface GuestProfile {
  schemaVersion: number;
  guestId: string;
  displayName: string;
  createdAt: string;
  epoch: number;
}

export const GUEST_COPY = {
  entry: '游客进入预览',
  badge: '游客模式',
  localOnly: '数据仅保存在本机，不会上传服务器',
  upgrade: '登录华为账号',
  exit: '退出游客模式',
  rewardsUnavailable: '游客模式暂不支持签到与积分功能，登录华为账号后可用',
  storageUnavailable: '本机存储不可用，无法进入游客模式',
  dataReset: '游客数据已重置',
  confirmExit: '退出后本机游客数据将被清除，确定退出？',
  confirmUpgrade: '登录华为账号后，本机游客数据将被清除，确定继续？'
} as const;

export function byteLength(text: string): number {
  // React Native 无 TextEncoder 时退化为 UTF-8 手算。
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}