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

// FST-01：无有效会话打开 Web 版，首屏必须是登录页，不得直接落在 check 清单。
test('无会话时首屏渲染登录页而非 check 清单', async () => {
  sessionStorage.clear();
  const root = await mountApp();
  const text = root.textContent ?? '';

  expect(text).toContain('华为账号登录');
  expect(text).toContain('游客进入预览');
  expect(text).toContain('网页版暂不支持华为账号登录');
  expect(text).not.toContain('今日记录');
});