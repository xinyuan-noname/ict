/**
 * @jest-environment jsdom
 */
import { AppRegistry } from 'react-native';
import App from '../../App';

async function mountApp(): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  AppRegistry.registerComponent('ICTApp', () => App);
  AppRegistry.runApplication('ICTApp', { rootTag: root });
  await new Promise((resolve) => setTimeout(resolve, 150));
  return root;
}

function press(element: Element): void {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}

// FST-02/FST-03：游客入口一次交互进入 check 清单，且游客模式零业务网络请求。
test('点击游客入口 1 次进入 check 清单且不发起网络请求', async () => {
  const fetchSpy = jest.fn(() => Promise.reject(new Error('offline')));
  (globalThis as { fetch?: unknown }).fetch = fetchSpy;
  sessionStorage.clear();

  const root = await mountApp();
  const entry = root.querySelector('[data-testid="guest-entry"]');
  expect(entry).not.toBeNull();

  press(entry as Element);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const text = root.textContent ?? '';
  expect(text).toContain('游客模式');
  expect(text).toContain('今日记录');
  expect(text).not.toContain('网页版暂不支持华为账号登录');
  // 允许登录页渲染前的一次能力探测；游客窗口内不得有任何业务请求（WXO-65）。
  const businessCalls = fetchSpy.mock.calls.filter(
    (call) => !String(call[0]).includes('/v1/auth/wechat/availability')
  );
  expect(businessCalls).toHaveLength(0);
});