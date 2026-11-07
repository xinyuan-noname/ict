import { AppRegistry } from 'react-native';
import { renderToString } from 'react-dom/server';
import App from '../../App';

// Web 首屏冒烟：模块顶层不能抛错，且应用必须渲染出可见文案（防止再次白屏）
test('Web 入口可加载并渲染首屏文案', () => {
  AppRegistry.registerComponent('ICTApp', () => App);
  const { element } = AppRegistry.getApplication('ICTApp', {});
  const html = renderToString(element);

  expect(html.length).toBeGreaterThan(0);
  expect(html).toMatch(/登录态恢复中|游客进入预览|华为账号/);
});