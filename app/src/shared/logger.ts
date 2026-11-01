import { userMessageFor } from './errorCatalog';

// 结构化日志：字段白名单 + 值掩码，release 下不输出敏感字段（任务 29.6）。
const SENSITIVE_KEYS = new Set([
  'authCode',
  'auth_code',
  'sessionToken',
  'session_token',
  'token',
  'code',
  'clientSecret',
  'client_secret',
  'password'
]);

const TOKEN_PATTERN = /s1_[A-Za-z0-9_-]{43}/g;
const PHONE_PATTERN = /\b1[3-9]\d{9}\b/g;

export function maskValue(value: string): string {
  return value.replace(TOKEN_PATTERN, 's1_***').replace(PHONE_PATTERN, '***');
}

export function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '***';
      continue;
    }
    out[key] = typeof value === 'string' ? maskValue(value) : value;
  }
  return out;
}

type Sink = (line: string) => void;

let sink: Sink = () => {
  /* release 默认静默 */
};

export function setLogSink(next: Sink): void {
  sink = next;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const payload = sanitize({ event, ...fields, ts: new Date().toISOString() });
  sink(JSON.stringify(payload));
}

export function describeError(code?: string): string {
  return userMessageFor(code);
}