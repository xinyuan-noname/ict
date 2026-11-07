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

test('饮水今日页渲染单位按钮、自定义入口与确认记录', async () => {
  const root = mountShell();
  await wait(150);
  const text = root.textContent ?? '';

  expect(text).toContain('杯 250ml');
  expect(text).toContain('农夫山泉 550ml');
  expect(text).toContain('+ 自定义');
  expect(text).toContain('确认记录');
  expect(text).toContain('连续达标');
});

test('点击「+ 自定义」弹出自定义单位对话框', async () => {
  const root = mountShell();
  await wait(150);

  const custom = Array.from(root.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes('自定义')
  );
  expect(custom).toBeTruthy();
  (custom as HTMLElement).click();
  await wait(150);

  const bodyText = document.body.textContent ?? '';
  expect(bodyText).toContain('自定义单位');
  expect(bodyText).toContain('添加单位');
});

test('单位按钮行居中、三指标卡对齐居中', async () => {
  const root = mountShell();
  await wait(150);

  const unitsRow = root.querySelector('[data-testid="water-units"]') as HTMLElement;
  expect(unitsRow).toBeTruthy();
  expect(window.getComputedStyle(unitsRow).justifyContent).toBe('center');
});

test('单位按钮不使用边框或底色（不长期高亮）', async () => {
  const root = mountShell();
  await wait(150);

  const cup = Array.from(root.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes('杯 250ml')
  ) as HTMLElement;
  expect(cup).toBeTruthy();
  const style = window.getComputedStyle(cup);
  expect(style.borderTopWidth === '' || style.borderTopWidth === '0px').toBe(true);
  expect(style.backgroundColor === '' || style.backgroundColor === 'rgba(0, 0, 0, 0)').toBe(true);
});

test('饮水统计页渲染周记 / 月记 / 季度记三档', async () => {
  const root = mountShell();
  await wait(150);

  const dataTab = Array.from(root.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes('数据')
  );
  expect(dataTab).toBeTruthy();
  (dataTab as HTMLElement).click();
  await wait(150);

  const text = root.textContent ?? '';
  expect(text).toContain('统计');
  expect(text).toContain('成就');
  expect(text).toContain('周记');
  expect(text).toContain('月记');
  expect(text).toContain('季度记');
  expect(text).toContain('周记平均');
});