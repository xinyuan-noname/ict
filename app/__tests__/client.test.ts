import { ApiClient, ApiError, NetworkError, ProtocolError, assertBaseUrl } from '../src/api/client';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body
  } as unknown as Response;
}

describe('ApiClient', () => {
  it('拒绝非 https 且不在白名单中的地址', () => {
    expect(() => assertBaseUrl('http://evil.example.com')).toThrow(ProtocolError);
    expect(assertBaseUrl('https://api.example.com')).toBe('https://api.example.com');
    expect(assertBaseUrl('http://10.0.2.2:8443', true)).toBe('http://10.0.2.2:8443');
  });

  it('成功响应返回 data 与 traceId', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: (async () => jsonResponse({ ok: 1, traceId: 'trace-1' })) as unknown as typeof fetch
    });
    const res = await client.request<{ ok: number }>('/v1/health');
    expect(res.data.ok).toBe(1);
    expect(res.traceId).toBe('trace-1');
  });

  it('traceId 缺失时回退响应头', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: (async () => jsonResponse({ ok: 1 }, 200, { 'X-Trace-Id': 'header-trace' })) as unknown as typeof fetch
    });
    const res = await client.request('/v1/health');
    expect(res.traceId).toBe('header-trace');
  });

  it('连接失败抛 NetworkError 且不产生错误码', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: (async () => {
        throw new TypeError('failed to fetch');
      }) as unknown as typeof fetch
    });
    await expect(client.request('/v1/health')).rejects.toBeInstanceOf(NetworkError);
  });

  it('429 解析 Retry-After 并保留错误码', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: (async () =>
        jsonResponse({ code: 'AUTH_007', message: '操作过于频繁', traceId: 't-429' }, 429, { 'Retry-After': '42' })) as unknown as typeof fetch
    });
    try {
      await client.request('/v1/auth/huawei/login', { method: 'POST', body: {} });
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('AUTH_007');
      expect(apiErr.retryAfter).toBe(42);
      expect(apiErr.traceId).toBe('t-429');
    }
  });

  it('缺少统一包络的错误响应视为协议异常', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchImpl: (async () => jsonResponse({ message: 'nope' }, 500)) as unknown as typeof fetch
    });
    await expect(client.request('/v1/health')).rejects.toBeInstanceOf(ProtocolError);
  });

  it('超时触发 abort 并归一为 timeout', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      timeoutMs: 10,
      fetchImpl: ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as unknown as typeof fetch
    });
    await expect(client.request('/v1/health')).rejects.toMatchObject({ kind: 'timeout' });
  });
});