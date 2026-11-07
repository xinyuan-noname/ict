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

describe('数据页', () => {
  test('数据页只读：不出现记录写入按钮', async () => {
    const root = mountShell();
    await wait(150);
    buttonByText(root, '数据')?.click();
    await wait(150);

    const text = root.textContent ?? '';
    expect(text).not.toContain('保存记录');
    expect(text).not.toContain('确认记录');
  });

  test('饮水成就占位提供「去记录」并回到 check 页', async () => {
    const root = mountShell();
    await wait(150);
    buttonByText(root, '数据')?.click();
    await wait(150);
    buttonByText(root, '成就')?.click();
    await wait(150);

    const text = root.textContent ?? '';
    expect(text).toContain('饮水成就正在接入');

    buttonByText(root, '去记录')?.click();
    await wait(150);
    expect(root.querySelector('[data-testid="data-pane-stats"]')).toBeNull();
    expect((root.textContent ?? '')).toContain('今日记录');
  });

  test('运动清单在数据页分别提供统计与成就', async () => {
    const root = mountShell();
    await wait(150);
    buttonByText(root, '运动')?.click();
    await wait(150);
    buttonByText(root, '数据')?.click();
    await wait(150);

    expect((root.textContent ?? '')).toContain('运动趋势');
    buttonByText(root, '成就')?.click();
    await wait(150);
    expect((root.textContent ?? '')).toContain('运动成就');
  });
});