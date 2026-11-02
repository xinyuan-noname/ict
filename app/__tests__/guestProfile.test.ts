import { createGuestProfile, generateGuestId, isValidGuestId, parseGuestProfile, serializeGuestProfile } from '../src/guest/guestProfile';
import { GUEST_DISPLAY_NAME, GUEST_PROFILE_MAX_BYTES, byteLength } from '../src/guest/types';

describe('guestProfile', () => {
  it('生成的 guestId 为 guest_ + 32 位十六进制', () => {
    const id = generateGuestId();
    expect(id).toMatch(/^guest_[0-9a-f]{32}$/);
    expect(isValidGuestId(id)).toBe(true);
    expect(generateGuestId()).not.toBe(id);
  });

  it('创建与解析往返一致', () => {
    const profile = createGuestProfile('2026-11-02T00:00:00Z', 1);
    const raw = serializeGuestProfile(profile);
    expect(byteLength(raw)).toBeLessThanOrEqual(GUEST_PROFILE_MAX_BYTES);
    const parsed = parseGuestProfile(raw);
    expect(parsed).toEqual(profile);
  });

  it('拒绝未知字段、错版本、非法 guestId', () => {
    const profile = createGuestProfile('2026-11-02T00:00:00Z', 1);
    expect(parseGuestProfile(JSON.stringify({ ...profile, extra: 1 }))).toBeNull();
    expect(parseGuestProfile(JSON.stringify({ ...profile, schemaVersion: 2 }))).toBeNull();
    expect(parseGuestProfile(JSON.stringify({ ...profile, guestId: 'guest_short' }))).toBeNull();
    expect(parseGuestProfile('not-json')).toBeNull();
    expect(parseGuestProfile('')).toBeNull();
  });

  it('昵称固定为游客，不接受自定义', () => {
    const profile = createGuestProfile('2026-11-02T00:00:00Z', 1);
    expect(profile.displayName).toBe(GUEST_DISPLAY_NAME);
    expect(parseGuestProfile(JSON.stringify({ ...profile, displayName: '自定义' }))).toBeNull();
  });

  it('超过 2KB 视为损坏', () => {
    const padding = 'x'.repeat(GUEST_PROFILE_MAX_BYTES + 1);
    expect(parseGuestProfile(padding)).toBeNull();
  });
});