/**
 * @jest-environment jsdom
 */
import '../../src/web/bootGuard';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// FST-06：启动期异常必须落到可见文本，不得白屏，且凭证不得外泄。
describe('bootGuard 启动异常兜底', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  test('编译期错误事件渲染可读文本', async () => {
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('Cannot find module ./missing: sessionToken=secret_token_value') })
    );
    await flush();

    const root = document.getElementById('root') as HTMLElement;
    const text = root.textContent ?? '';
    expect(text).toContain('Web 启动失败');
    expect(text).not.toContain('secret_token_value');
    expect(root.childElementCount).toBeGreaterThan(0);
  });

  test('未处理的 Promise 拒绝同样兜底', async () => {
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('boot failed: authCode=1234567890abcdef');
    window.dispatchEvent(event);
    await flush();

    const text = (document.getElementById('root') as HTMLElement).textContent ?? '';
    expect(text).toContain('Web 启动失败');
    expect(text).not.toContain('1234567890abcdef');
  });
});