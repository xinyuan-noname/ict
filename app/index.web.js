// bootGuard 必须排在 App 之前：若 App 模块顶层抛错，仍能把错误显示到页面
import './src/web/bootGuard';
import { AppRegistry } from 'react-native';
import App from './App';

const APP_NAME = 'ICTApp';
const root = document.getElementById('root');

try {
  if (!root) {
    throw new Error('#root not found');
  }
  AppRegistry.registerComponent(APP_NAME, () => App);
  AppRegistry.runApplication(APP_NAME, { rootTag: root });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (root) {
    root.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.cssText = 'padding:16px;color:#a61b1b;font-size:12px;white-space:pre-wrap';
    pre.textContent = `Web 启动失败：\n${message}`;
    root.appendChild(pre);
  }
}