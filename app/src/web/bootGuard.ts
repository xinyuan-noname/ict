// 必须最先执行：捕获模块加载阶段的异常（此时 React 尚未挂载）
function renderBootError(message: string): void {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) {
    // 已有内容说明应用已挂载，不覆盖
    return;
  }
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:16px;color:#a61b1b;font-size:12px;line-height:18px;white-space:pre-wrap';
  pre.textContent = `Web 启动失败：\n${message}`;
  root.appendChild(pre);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

window.addEventListener('error', (event) => {
  renderBootError(describeError(event.error ?? event.message));
});

window.addEventListener('unhandledrejection', (event) => {
  renderBootError(describeError(event.reason));
});