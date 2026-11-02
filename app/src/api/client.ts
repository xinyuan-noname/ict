export type NetworkKind = 'offline' | 'timeout' | 'aborted';

export class NetworkError extends Error {
  readonly kind: NetworkKind;
  constructor(kind: NetworkKind, message?: string) {
    super(message ?? `network ${kind}`);
    this.name = 'NetworkError';
    this.kind = kind;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly traceId: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(status: number, code: string | undefined, traceId: string | undefined, retryAfter?: number) {
    super(code ?? `http ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
  }
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  token?: string;
  idempotencyKey?: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  allowInsecure?: boolean;
}

export interface RawResponse<T> {
  data: T;
  traceId: string;
}

const INSECURE_ALLOWED = ['http://10.0.2.2', 'http://127.0.0.1', 'http://localhost'];

export function assertBaseUrl(baseUrl: string, allowInsecure = false): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (allowInsecure && INSECURE_ALLOWED.some((p) => trimmed === p || trimmed.startsWith(`${p}:`))) {
    return trimmed;
  }
  throw new ProtocolError('API_BASE_URL must be https:// (http only allowed for local dev)');
}

let localTraceSeq = 0;

function localTraceId(): string {
  localTraceSeq += 1;
  return `local-${Date.now().toString(36)}-${localTraceSeq}`;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = assertBaseUrl(options.baseUrl, options.allowInsecure ?? false);
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<RawResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new NetworkError('timeout');
      }
      throw new NetworkError('offline', err instanceof Error ? err.message : 'fetch failed');
    } finally {
      clearTimeout(timer);
    }

    const headerTrace = response.headers.get('X-Trace-Id') ?? undefined;
    let payload: unknown = undefined;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    const record = (payload ?? {}) as Record<string, unknown>;
    const bodyTrace = typeof record.traceId === 'string' ? record.traceId : undefined;
    const traceId = bodyTrace ?? headerTrace ?? localTraceId();

    if (!response.ok) {
      const code = typeof record.code === 'string' ? record.code : undefined;
      if (!code) {
        // 4xx/5xx 但缺少统一包络：属于协议异常，绝不伪装成账号错误。
        throw new ProtocolError(`unexpected response status ${response.status}`);
      }
      const retryAfterRaw = response.headers.get('Retry-After');
      const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : undefined;
      throw new ApiError(response.status, code, traceId, retryAfter);
    }

    if (payload === undefined) {
      throw new ProtocolError('empty or non-json response');
    }
    return { data: payload as T, traceId };
  }
}