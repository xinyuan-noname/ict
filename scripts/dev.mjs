// 一键开发启动器：构建 Go 服务端 → 启动 hwsim + authd → 等待健康检查 → 启动 Metro → 打开预览。
// 用法：
//   npm start                 完整开发环境
//   npm run start:api         仅后端（不启动 Metro）
//   node scripts/dev.mjs --no-open --no-metro
//   node scripts/dev.mjs --self-test   （构建+启动+冒烟后自动退出）
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER = join(ROOT, 'server');
const APP = join(ROOT, 'app');
const LOGS = join(ROOT, '.dev', 'logs');
const BIN = join(SERVER, 'bin');
const TOOLS_BIN = join(ROOT, '.tools', 'bin');

const flags = new Set(process.argv.slice(2));
const apiOnly = flags.has('--api-only');
const webOnly = flags.has('--web-only');
const webMode = flags.has('--web') || webOnly;
const noMetro = flags.has('--no-metro') || apiOnly || webMode;
const noOpen = flags.has('--no-open');
const selfTest = flags.has('--self-test');
const buildOnly = flags.has('--build-only');

const HWSIM_PORT = 18081;
const AUTHD_PORT = 18443;
const METRO_PORT = 8081;
const BASE = `http://127.0.0.1:${AUTHD_PORT}`;

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[dev] ${msg}`);
}

function findGo() {
  const candidates = [
    process.env.GOROOT ? join(process.env.GOROOT, 'bin', process.platform === 'win32' ? 'go.exe' : 'go') : '',
    join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'scoop', 'apps', 'go', 'current', 'bin', 'go.exe'),
    'go'
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (c === 'go') return { cmd: 'go', env: process.env };
    if (existsSync(c)) {
      const goroot = resolve(c, '..', '..');
      return { cmd: c, env: { ...process.env, GOROOT: goroot } };
    }
  }
  return { cmd: 'go', env: process.env };
}

function build(go) {
  mkdirSync(BIN, { recursive: true });
  mkdirSync(TOOLS_BIN, { recursive: true });
  log('building authd ...');
  const authd = spawnSync(go.cmd, ['build', '-o', join(BIN, 'authd.exe'), './cmd/authd'], {
    cwd: SERVER, env: go.env, stdio: 'inherit'
  });
  if (authd.status !== 0) {
    console.error('[dev] authd build failed');
    process.exit(1);
  }
  log('building hwsim (dev only) ...');
  const hwsim = spawnSync(go.cmd, ['build', '-o', join(TOOLS_BIN, 'hwsim.exe'), './cmd/hwsim'], {
    cwd: SERVER, env: go.env, stdio: 'inherit'
  });
  if (hwsim.status !== 0) {
    console.error('[dev] hwsim build failed');
    process.exit(1);
  }
}

function start(name, cmd, args, options) {
  mkdirSync(LOGS, { recursive: true });
  const out = openSync(join(LOGS, `${name}.log`), 'a');
  // Windows 上 npx / npm 是 .cmd 脚本：直接 spawn 会 EINVAL/ENOENT，必须经 shell
  const useShell = process.platform === 'win32' && (cmd === 'npx' || cmd === 'npm');
  const child = spawn(cmd, args, {
    ...options,
    shell: useShell,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  closeSync(out);
  children.push({ name, child });
  child.on('error', (error) => {
    // 必须消费 error 事件，否则 Node 会以未捕获异常退出
    console.error(`[dev] ${name} failed to start: ${error.message}`);
  });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0 && code !== null) {
      console.error(`[dev] ${name} exited with code ${code}, see .dev/logs/${name}.log`);
    }
  });
  log(`${name} started (log: .dev/logs/${name}.log)`);
  return child;
}

async function waitHealthy(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/v1/health`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await delay(500);
  }
  throw new Error('authd health check timeout');
}

async function selfTestRun() {
  const health = await waitHealthy();
  log(`health ok: status=${health.status} checks=${JSON.stringify(health.checks)}`);

  const login = await fetch(`${BASE}/v1/auth/huawei/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'android', authCode: 'dev-self-test', clientVersion: '1.0.0' })
  });
  const loginBody = await login.json();
  if (!loginBody.sessionToken) {
    throw new Error(`login failed: ${JSON.stringify(loginBody)}`);
  }
  log(`login ok (token length ${loginBody.sessionToken.length})`);

  const token = loginBody.sessionToken;
  const checkin = await fetch(`${BASE}/v1/rewards/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}'
  });
  const checkinBody = await checkin.json();
  log(`check-in: ${JSON.stringify({ earned: checkinBody.earnedPoints, balance: checkinBody.balanceAfter })}`);

  const frames = await fetch(`${BASE}/v1/rewards/frames`, { headers: { Authorization: `Bearer ${token}` } });
  const framesBody = await frames.json();
  log(`frames: ${framesBody.frames?.length ?? 0} items (catalog ${framesBody.catalogVersion})`);
  if (!framesBody.frames || framesBody.frames.length === 0) {
    throw new Error('frames catalog empty');
  }
}

async function pickWebPort(start = 3000, end = 3010) {
  for (let port = start; port <= end; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  return start;
}

function openUrl(url) {
  if (noOpen) return;
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    log(`browser opened: ${url}`);
  } catch {
    log(`open manually: ${url}`);
  }
}

function openPreview() {
  if (noOpen) return;
  const file = join(ROOT, 'preview', 'index.html');
  const url = `file:///${file.replace(/\\/g, '/')}`;
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    log('preview opened in browser');
  } catch {
    log(`preview: ${url}`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { name, child } of children) {
    log(`stopping ${name}`);
    try {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  for (const { child } of children) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
});

async function main() {
  if (webOnly) {
    const port = await pickWebPort();
    start('web', 'npx', ['webpack', 'serve', '--mode', 'development', '--port', String(port)], { cwd: APP });
    log(`Web: http://127.0.0.1:${port}`);
    openUrl(`http://127.0.0.1:${port}`);
    log('press Ctrl+C to stop');
    return;
  }

  const go = findGo();
  log(`go: ${go.cmd}`);
  build(go);

  if (buildOnly) {
    log(`build ok: ${join(BIN, 'authd.exe')}`);
    log(`build ok: ${join(TOOLS_BIN, 'hwsim.exe')}`);
    return;
  }

  start('hwsim', join(TOOLS_BIN, 'hwsim.exe'), ['--addr', `:${HWSIM_PORT}`, '--scenario', 'success'], {
    cwd: SERVER
  });

  start('authd', join(BIN, 'authd.exe'), [], {
    cwd: SERVER,
    env: {
      ...process.env,
      ENV: 'development',
      AUTH_MODE: 'mock',
      AUTH_ALLOW_MOCK: '1',
      HWSIM_BASE_URL: `http://127.0.0.1:${HWSIM_PORT}`,
      AUTH_STORAGE_NAMESPACE: 'real-mock',
      SERVER_ADDR: `:${AUTHD_PORT}`,
      SESSION_PEPPER: 'dev-pepper-0123456789abcdef',
      DATABASE_DSN: './data/dev.json',
      LOG_LEVEL: 'info'
    }
  });

  await waitHealthy();
  log(`backend ready: ${BASE}/v1/health`);
  log(`hwsim stats: http://127.0.0.1:${HWSIM_PORT}/hwsim/stats`);

  if (selfTest) {
    await selfTestRun();
    log('self-test passed');
    shutdown(0);
    return;
  }

  let webPort = 0;
  if (webMode) {
    webPort = await pickWebPort();
    start('web', 'npx', ['webpack', 'serve', '--mode', 'development', '--port', String(webPort)], { cwd: APP });
    log(`Web: http://127.0.0.1:${webPort}`);
  } else if (!noMetro) {
    start('metro', 'npx', ['react-native', 'start', '--port', String(METRO_PORT)], {
      cwd: APP,
      env: { ...process.env, RCT_METRO_PORT: String(METRO_PORT) }
    });
    log(`Metro: http://127.0.0.1:${METRO_PORT}`);
  } else {
    log('Metro skipped (--no-metro)');
  }

  if (webMode) {
    openUrl(`http://127.0.0.1:${webPort}`);
  } else {
    openPreview();
  }
  log('press Ctrl+C to stop everything');
  log('');
  log('quick check:');
  log(`  curl ${BASE}/v1/health`);
  log(`  bash scripts/rewards-demo.sh   (independent demo, stops its own processes)`);
}

main().catch((err) => {
  console.error(`[dev] ${err.message}`);
  shutdown(1);
});