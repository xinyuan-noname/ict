import { AppRegistry } from 'react-native';
import App from './App';

const APP_NAME = 'ICTApp';
const root = document.getElementById('root');

function showFatal(message: string): void {
  if (!root) {
    return;
  }
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:16px;color:#a61b1b;font-size:12px;line-height:18px;white-space:pre-wrap';
  pre.textContent = `Web 启动失败：\n${message}`;
  root.appendChild(pre);
}

window.addEventListener('error', (event) => showFatal(event.message ?? 'unknown error'));
window.addEventListener('unhandledrejection', (event) => showFatal(String(event.reason)));

try {
  if (!root) {
    throw new Error('#root not found');
  }
  AppRegistry.registerComponent(APP_NAME, () => App);
  AppRegistry.runApplication(APP_NAME, { rootTag: root });
} catch (error) {
  showFatal(error instanceof Error ? error.stack ?? error.message : String(error));
}