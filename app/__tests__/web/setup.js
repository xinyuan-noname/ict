// jsdom 不提供 fetch；真实浏览器有。这里补一个拒绝型桩，避免测试因运行时差异中断挂载。
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = () => Promise.reject(new Error('fetch disabled in jsdom test'));
}