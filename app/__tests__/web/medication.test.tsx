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

function clickByText(root: HTMLElement, text: string): void {
  // Modal 内容在 RNW 中挂到 body，搜索范围取整页
  const scope = document.body;
  const target = Array.from(scope.querySelectorAll('[role="button"]')).find((el) =>
    (el.textContent ?? '').includes(text)
  );
  expect(target).toBeTruthy();
  (target as HTMLElement).click();
}

test('药物管理默认只显示条目列表，点 + 才出现新增药物界面', async () => {
  const root = mountShell();
  await wait(150);

  clickByText(root, '服药');
  await wait(150);
  clickByText(root, '管理药物');
  await wait(150);

  const manageText = document.body.textContent ?? '';
  expect(manageText).toContain('药物管理');
  expect(manageText).toContain('＋ 新增药物');
  // 未点 + 之前不出现新增表单的提交按钮
  expect(manageText).not.toContain('添加药物');

  clickByText(root, '＋ 新增药物');
  await wait(600);

  const formText = document.body.textContent ?? '';
  expect(formText).toContain('新增药物');
  expect(formText).toContain('添加药物');
  // 管理列表已被新增界面取代
  expect(formText).not.toContain('药物管理');

  // 空表单提交：留在新增界面并提示必填
  clickByText(document.body as unknown as HTMLElement, '添加药物');
  await wait(150);
  const errorText = document.body.textContent ?? '';
  expect(errorText).toContain('药名、剂量与至少一个时段必填');
  expect(errorText).toContain('新增药物');
});