/**
 * @jest-environment jsdom
 */
import { TextDecoder, TextEncoder } from 'util';
import React from 'react';
import { LoginScreen } from '../../src/screens/LoginScreen';

// jsdom 缺少 TextEncoder/TextDecoder；react-dom/server 需在 polyfill 之后加载。
(globalThis as unknown as { TextEncoder: unknown }).TextEncoder = TextEncoder;
(globalThis as unknown as { TextDecoder: unknown }).TextDecoder = TextDecoder;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderToString } = require('react-dom/server') as typeof import('react-dom/server');

// WXO-39/40/41：微信主、游客次、华为禁用说明最弱。
describe('登录页微信三要素', () => {
  test('微信可用时按序渲染微信、游客、华为', () => {
    const html = renderToString(
      <LoginScreen
        loading={false}
        onLogin={() => undefined}
        onGuest={() => undefined}
        wechat={{ available: true, onLogin: () => undefined }}
        loginDisabled
        loginHint="网页版暂不支持华为账号登录，请使用微信登录或游客进入"
      />
    );
    const wechat = html.indexOf('微信登录');
    const guest = html.indexOf('游客进入预览');
    const huawei = html.indexOf('华为账号登录');
    expect(wechat).toBeGreaterThanOrEqual(0);
    expect(guest).toBeGreaterThan(wechat);
    expect(huawei).toBeGreaterThan(guest);
    expect(html).toContain('微信登录或游客进入');
  });

  test('微信不可用时游客为主操作且给出原因', () => {
    const html = renderToString(
      <LoginScreen
        loading={false}
        onLogin={() => undefined}
        onGuest={() => undefined}
        wechat={{ available: false, reason: 'unconfigured', onLogin: () => undefined }}
        loginDisabled
      />
    );
    expect(html).toContain('微信登录暂不可用');
    expect(html).toContain('可使用游客模式继续体验');
    expect(html).toContain('游客进入预览');
  });

  test('未传 wechat 时保持既有渲染（华为 + 游客）', () => {
    const html = renderToString(
      <LoginScreen loading={false} onLogin={() => undefined} onGuest={() => undefined} />
    );
    expect(html).toContain('华为账号登录');
    expect(html).toContain('游客进入预览');
    expect(html).not.toContain('微信登录');
  });
});