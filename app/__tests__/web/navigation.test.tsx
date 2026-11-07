/**
 * @jest-environment jsdom
 */
import React from 'react';
import { AppRegistry } from 'react-native';
import { CheckStore } from '../../src/check/checkStore';
import { CheckShell } from '../../src/screens/CheckShell';
import type { CheckApi } from '../../src/api/checkApi';

function mountShell(): HTMLElement {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  const store = new CheckStore({ api: {} as unknown as CheckApi, getToken: () => null });
  const Shell = (): React.JSX.Element => (
    <CheckShell store={store} isGuest displayName="游客" onExit={() => undefined} />
  );
  AppRegistry.registerComponent('Shell', () => Shell);
  AppRegistry.runApplication('Shell', { rootTag: root });
  return root;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buttonByText(root: HTMLElement, text: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes(text)
  ) as HTMLElement | undefined;
}

describe('导航收敛', () => {
  test('底部固定三项 check / 数据 / 我的，且无常驻「统计」「成就」入口', async () => {
    const root = mountShell();
    await wait(150);

    const bottom = root.querySelector('[data-testid="bottom-tabs"]') as HTMLElement;
    expect(bottom).toBeTruthy();
    const text = bottom.textContent ?? '';
    expect(text).toContain('check');
    expect(text).toContain('数据');
    expect(text).toContain('我的');
    expect(text).not.toContain('统计');
    expect(text).not.toContain('成就');
  });

  test('点击「数据」进入数据页，二级默认统计', async () => {
    const root = mountShell();
    await wait(150);

    buttonByText(root, '数据')?.click();
    await wait(150);

    const statsPane = root.querySelector('[data-testid="data-pane-stats"]') as HTMLElement;
    const achPane = root.querySelector('[data-testid="data-pane-achievements"]') as HTMLElement;
    expect(statsPane).toBeTruthy();
    expect(achPane).toBeTruthy();
    expect(statsPane.getAttribute('aria-hidden')).not.toBe('true');
    expect(achPane.getAttribute('aria-hidden')).toBe('true');
    expect((root.textContent ?? '')).toContain('周记');
  });

  test('切到成就二级后，统计子页隐藏', async () => {
    const root = mountShell();
    await wait(150);
    buttonByText(root, '数据')?.click();
    await wait(150);

    buttonByText(root, '成就')?.click();
    await wait(150);

    const statsPane = root.querySelector('[data-testid="data-pane-stats"]') as HTMLElement;
    const achPane = root.querySelector('[data-testid="data-pane-achievements"]') as HTMLElement;
    expect(statsPane.getAttribute('aria-hidden')).toBe('true');
    expect(achPane.getAttribute('aria-hidden')).not.toBe('true');
  });

  test('切一级分类不劫持当前页签', async () => {
    const root = mountShell();
    await wait(150);
    buttonByText(root, '数据')?.click();
    await wait(150);

    buttonByText(root, '学习')?.click();
    await wait(150);

    const statsPane = root.querySelector('[data-testid="data-pane-stats"]');
    expect(statsPane).toBeTruthy();
  });

  test('「我的」页不渲染健康/学习一级切换器', async () => {
    const root = mountShell();
    await wait(150);

    expect(root.querySelector('[data-testid="nav-level1"]')).toBeTruthy();
    buttonByText(root, '我的')?.click();
    await wait(150);
    expect(root.querySelector('[data-testid="nav-level1"]')).toBeNull();
    const text = root.textContent ?? '';
    expect(text).not.toContain('健康');
    expect(text).not.toContain('学习');
  });
});