/**
 * @jest-environment jsdom
 */
import { weChatOrigin } from '../../src/api/wechatAuthApi';

// file:// 打开时 location.origin 是字符串 "null"，必须视为不可用，
// 否则装配层会用非法 baseUrl 构造 ApiClient 并在渲染期抛 ProtocolError。
describe('weChatOrigin', () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, configurable: true });
  });

  test('file:// 的 "null" origin 视为不可用', () => {
    Object.defineProperty(window, 'location', { value: { origin: 'null' }, configurable: true });
    expect(weChatOrigin()).toBe('');
  });

  test('空 origin 视为不可用', () => {
    Object.defineProperty(window, 'location', { value: { origin: '' }, configurable: true });
    expect(weChatOrigin()).toBe('');
  });

  test('http(s) 同源正常返回', () => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:3000' }, configurable: true });
    expect(weChatOrigin()).toBe('http://localhost:3000');

    Object.defineProperty(window, 'location', { value: { origin: 'https://example.com' }, configurable: true });
    expect(weChatOrigin()).toBe('https://example.com');
  });
});