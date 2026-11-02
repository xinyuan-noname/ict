import {
  GUEST_DISPLAY_NAME,
  GUEST_ID_PREFIX,
  GUEST_PROFILE_MAX_BYTES,
  GUEST_SCHEMA_VERSION,
  byteLength,
  type GuestProfile
} from './types';

const HEX = '0123456789abcdef';

function randomHex(length: number): string {
  // 优先使用宿主提供的 CSPRNG；缺失时退化为多源混合（原生桥见 P4，未验证）。
  const bytes = new Uint8Array(length / 2);
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256) ^ (Date.now() & 0xff);
    }
  }
  let out = '';
  for (const b of bytes) out += HEX.charAt(b >> 4) + HEX.charAt(b & 0x0f);
  return out;
}

export function generateGuestId(): string {
  return `${GUEST_ID_PREFIX}${randomHex(32)}`;
}

export function isValidGuestId(id: string): boolean {
  return new RegExp(`^${GUEST_ID_PREFIX}[0-9a-f]{32}$`).test(id);
}

export function createGuestProfile(nowIso: string, epoch: number): GuestProfile {
  return {
    schemaVersion: GUEST_SCHEMA_VERSION,
    guestId: generateGuestId(),
    displayName: GUEST_DISPLAY_NAME,
    createdAt: nowIso,
    epoch
  };
}

const ALLOWED_KEYS = new Set(['schemaVersion', 'guestId', 'displayName', 'createdAt', 'epoch']);

// 白名单校验：未知字段、非法类型、超长内容一律视为损坏。
export function parseGuestProfile(raw: string): GuestProfile | null {
  if (byteLength(raw) > GUEST_PROFILE_MAX_BYTES) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return null;
    }
  }
  const { schemaVersion, guestId, displayName, createdAt, epoch } = record;
  if (schemaVersion !== GUEST_SCHEMA_VERSION) {
    return null;
  }
  if (typeof guestId !== 'string' || !isValidGuestId(guestId)) {
    return null;
  }
  if (displayName !== GUEST_DISPLAY_NAME || typeof createdAt !== 'string') {
    return null;
  }
  if (typeof epoch !== 'number' || !Number.isFinite(epoch) || epoch < 0) {
    return null;
  }
  return { schemaVersion: GUEST_SCHEMA_VERSION, guestId, displayName, createdAt, epoch };
}

export function serializeGuestProfile(profile: GuestProfile): string {
  const raw = JSON.stringify(profile);
  if (byteLength(raw) > GUEST_PROFILE_MAX_BYTES) {
    throw new Error('guest profile exceeds 2KB');
  }
  return raw;
}