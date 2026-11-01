import { ERROR_CODES, type ErrorCode } from '../../../contracts/generated/ts/error-catalog';

// 客户端本地码：取消授权不经过服务端（spec 7.6）。
export const LOCAL_CANCELLED = 'AUTH_002' as const;
export const GENERIC_UNKNOWN_MESSAGE = '操作失败，请稍后重试';

export type KnownCode = ErrorCode | typeof LOCAL_CANCELLED;

export interface CatalogEntry {
  code: string;
  httpStatus: number | null;
  userMessage: string;
  clientAction: string;
  retryable: boolean;
}

export function lookup(code: string): CatalogEntry | undefined {
  if (code === LOCAL_CANCELLED) {
    return {
      code: LOCAL_CANCELLED,
      httpStatus: null,
      userMessage: ERROR_CODES.AUTH_002.userMessage,
      clientAction: 'none',
      retryable: true
    };
  }
  if (code in ERROR_CODES) {
    const e = ERROR_CODES[code as ErrorCode];
    return { ...e, httpStatus: e.httpStatus };
  }
  return undefined;
}

// 未登记码一律兜底，避免空白文案（任务 29.2）。
export function userMessageFor(code: string | undefined): string {
  if (!code) {
    return GENERIC_UNKNOWN_MESSAGE;
  }
  return lookup(code)?.userMessage ?? GENERIC_UNKNOWN_MESSAGE;
}

export function shouldClearCredential(code: string): boolean {
  return code === 'AUTH_004' || code === 'AUTH_005' || code === 'AUTH_013' || code === 'AUTH_010';
}

export function isCancelled(code: string): boolean {
  return code === LOCAL_CANCELLED;
}

export const ALL_CATALOG_CODES: string[] = [...Object.keys(ERROR_CODES), LOCAL_CANCELLED];