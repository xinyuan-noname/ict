/**
 * @jest-environment jsdom
 */
import { AppRegistry } from 'react-native';
import App from '../../App';

// 真实浏览器挂载路径：向 #root 执行 runApplication，确认 DOM 中出现可见内容
test('runApplication 后 #root 内渲染出内容', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;

  AppRegistry.registerComponent('ICTApp', () => App);
  AppRegistry.runApplication('ICTApp', { rootTag: root });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // eslint-disable-next-line no-console
  console.log('ROOT_HTML:', root.innerHTML.slice(0, 1200));
  expect(root.childElementCount).toBeGreaterThan(0);
  expect(root.textContent ?? '').not.toBe('');
});