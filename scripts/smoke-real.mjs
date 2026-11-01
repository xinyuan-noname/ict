// 真实链路冒烟：仅在显式开启 AUTH_REAL_SMOKE_ALLOW=1 时执行（spec 5.4.12）。
// 用法：
//   AUTH_REAL_SMOKE_ALLOW=1 SMOKE_BASE_URL=https://api.example.com \
//   SMOKE_PLATFORM=android SMOKE_AUTH_CODE=<真实授权码> node scripts/smoke-real.mjs
const allow = process.env.AUTH_REAL_SMOKE_ALLOW === '1';
if (!allow) {
  console.error('refused: set AUTH_REAL_SMOKE_ALLOW=1 to run real smoke test');
  process.exit(2);
}

const baseUrl = process.env.SMOKE_BASE_URL;
if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error('refused: SMOKE_BASE_URL must be an https URL');
  process.exit(2);
}

const platform = process.env.SMOKE_PLATFORM ?? 'android';
const code = process.env.SMOKE_AUTH_CODE;

async function call(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) }
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const results = [];

const health = await call('/v1/health');
results.push({ step: 'health', status: health.status, statusField: health.body.status });

let token;
if (code) {
  const login = await call('/v1/auth/huawei/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, authCode: code, clientVersion: process.env.SMOKE_CLIENT_VERSION ?? '1.0.0' })
  });
  results.push({ step: 'login', status: login.status, code: login.body.code, traceId: login.body.traceId });
  token = login.body.sessionToken;

  if (token) {
    const validate = await call('/v1/auth/session/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token })
    });
    results.push({ step: 'validate', status: validate.status, valid: validate.body.valid });

    const me = await call('/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    results.push({ step: 'me', status: me.status, userId: me.body.user?.userId });
  }
} else {
  results.push({ step: 'login', skipped: 'SMOKE_AUTH_CODE not provided' });
}

for (const r of results) {
  console.log(JSON.stringify(r));
}

const failed = results.some((r) => !r.skipped && (r.status >= 400 || r.status === undefined));
console.log(failed ? 'smoke-real: FAILED' : 'smoke-real: PASSED (or skipped)');
process.exit(failed ? 1 : 0);