// 构建期产物，勿手改。由 contracts/error-codes.json 生成。
export const ERROR_CODES = {
  AUTH_001: { code: 'AUTH_001', httpStatus: 400, userMessage: '登录已过期，请重新登录', clientAction: 'relogin', retryable: true },
  AUTH_002: { code: 'AUTH_002', httpStatus: null, userMessage: '已取消授权，可重新登录', clientAction: 'none', retryable: true },
  AUTH_003: { code: 'AUTH_003', httpStatus: 503, userMessage: '华为账号服务暂时不可用，请稍后重试', clientAction: 'retry_manual', retryable: true },
  AUTH_004: { code: 'AUTH_004', httpStatus: 401, userMessage: '登录状态已失效，请重新登录', clientAction: 'clear_credential', retryable: false },
  AUTH_005: { code: 'AUTH_005', httpStatus: 401, userMessage: '登录已过期，请重新登录', clientAction: 'clear_credential', retryable: false },
  AUTH_006: { code: 'AUTH_006', httpStatus: 400, userMessage: '登录请求异常，请重新登录', clientAction: 'relogin', retryable: false },
  AUTH_007: { code: 'AUTH_007', httpStatus: 429, userMessage: '操作过于频繁，请稍后再试', clientAction: 'wait_retry_after', retryable: true },
  AUTH_008: { code: 'AUTH_008', httpStatus: 503, userMessage: '服务配置异常，请联系管理员', clientAction: 'contact_admin', retryable: false },
  AUTH_009: { code: 'AUTH_009', httpStatus: 400, userMessage: '当前平台暂不支持华为账号登录', clientAction: 'none', retryable: false },
  AUTH_010: { code: 'AUTH_010', httpStatus: 403, userMessage: '账号不可用，请联系管理员', clientAction: 'contact_admin', retryable: false },
  AUTH_011: { code: 'AUTH_011', httpStatus: 502, userMessage: '登录信息异常，请稍后重试', clientAction: 'retry_manual', retryable: true },
  AUTH_012: { code: 'AUTH_012', httpStatus: 500, userMessage: '登录失败，请稍后重试', clientAction: 'retry_manual', retryable: true },
  AUTH_013: { code: 'AUTH_013', httpStatus: 401, userMessage: '登录状态已失效，请重新登录', clientAction: 'clear_credential', retryable: false },
  AUTH_014: { code: 'AUTH_014', httpStatus: 500, userMessage: '操作失败，请稍后重试', clientAction: 'retry_manual', retryable: true }
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
