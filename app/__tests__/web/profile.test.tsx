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

function clickByText(text: string): void {
  const target = Array.from(document.body.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes(text)
  );
  expect(target).toBeTruthy();
  (target as HTMLElement).click();
}

test('点击出生日期弹出日期选择器，确定后回填 YYYY-MM-DD', async () => {
  const root = mountShell();
  await wait(150);

  const meTab = Array.from(root.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes('我的')
  ) as HTMLElement;
  expect(meTab).toBeTruthy();
  meTab.click();
  await wait(150);

  const field = document.querySelector('[data-testid="birth-date"]') as HTMLElement;
  expect(field).toBeTruthy();
  expect(field.textContent).toContain('YYYY-MM-DD');

  field.click();
  await wait(200);
  expect(document.body.textContent ?? '').toContain('选择出生日期');

  // 选择年份 1990 后确定
  clickByText('1990');
  await wait(80);
  clickByText('确定');
  await wait(150);

  expect(field.textContent).toContain('1990-01-01');
  expect(document.body.textContent ?? '').toContain('年龄：');
});
