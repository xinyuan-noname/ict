import { logEvent, maskValue, sanitize, setLogSink } from '../src/shared/logger';

describe('logger 脱敏', () => {
  it('掩码会话凭证与手机号', () => {
    const token = `s1_${'a'.repeat(43)}`;
    const masked = maskValue(`token=${token} phone=13800138000`);
    expect(masked).not.toContain(token);
    expect(masked).not.toContain('13800138000');
  });

  it('敏感键名直接替换为 ***', () => {
    const out = sanitize({ authCode: 'abc', sessionToken: 'xyz', client_secret: 's', normal: 'ok' });
    expect(out.authCode).toBe('***');
    expect(out.sessionToken).toBe('***');
    expect(out.client_secret).toBe('***');
    expect(out.normal).toBe('ok');
  });

  it('输出行不含凭证原文', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    const token = `s1_${'b'.repeat(43)}`;
    logEvent('session_restored', { sessionToken: token, note: `raw ${token}` });
    expect(lines).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(token);
  });
});