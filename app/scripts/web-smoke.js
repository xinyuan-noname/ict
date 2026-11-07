// 生产产物冒烟：用 jsdom 加载 dist/index.html + 真实 bundle，检测白屏与控制台异常。
// 用法：node scripts/web-smoke.js（需先执行 npm run web:build）
const fs = require('fs');
const path = require('path');

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (err) {
  console.error('[web-smoke] 缺少 jsdom，请安装：npm i -D jsdom');
  process.exit(1);
}

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('[web-smoke] 缺少 dist/index.html，请先执行 npm run web:build');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const scriptSrc = (html.match(/<script[^>]+src="([^"]+)"/) || [])[1];
if (!scriptSrc) {
  console.error('[web-smoke] dist/index.html 未引用脚本');
  process.exit(1);
}

const bundlePath = path.join(distDir, scriptSrc.replace(/^\.\//, ''));
const bundle = fs.readFileSync(bundlePath, 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (err) => errors.push(`jsdomError: ${err.message}`));
virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.join(' ')}`));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole
});

const { window } = dom;
// jsdom 无 fetch（真实浏览器有）；补桩避免误判为白屏
if (typeof window.fetch !== 'function') {
  window.fetch = () => Promise.reject(new Error('fetch disabled in web-smoke'));
}
window.eval(bundle);

setTimeout(() => {
  const root = window.document.getElementById('root');
  const text = (root ? root.textContent : '').trim();
  const childCount = root ? root.childElementCount : 0;

  console.log(`[web-smoke] #root 子节点=${childCount} 文本长度=${text.length}`);
  if (text) {
    console.log(`[web-smoke] 首屏文本: ${text.slice(0, 120)}`);
  }
  for (const line of errors) {
    console.log(`[web-smoke] ${line}`);
  }

  dom.window.close();

  if (!text || childCount === 0) {
    console.error('[web-smoke] 失败：页面没有任何可见内容（白屏）');
    process.exit(1);
  }
  if (errors.length > 0) {
    console.error('[web-smoke] 失败：启动期存在异常，见上方日志');
    process.exit(1);
  }
  console.log('[web-smoke] 通过');
}, 1500);