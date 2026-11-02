// 构建期产物，勿手改。由 contracts/check-error-codes.json 生成。
export const CHECK_ERROR_CODES = {
  CHECK_001: { code: 'CHECK_001', httpStatus: 400, userMessage: '请求参数有误，请重试', retryable: false },
  CHECK_002: { code: 'CHECK_002', httpStatus: 404, userMessage: '记录不存在', retryable: false },
  CHECK_003: { code: 'CHECK_003', httpStatus: 409, userMessage: '请求冲突，请重新提交', retryable: false },
  CHECK_004: { code: 'CHECK_004', httpStatus: 409, userMessage: '目标已更新，请刷新后重试', retryable: true },
  CHECK_005: { code: 'CHECK_005', httpStatus: 422, userMessage: '身体数据超出合理范围，请检查', retryable: false },
  CHECK_006: { code: 'CHECK_006', httpStatus: 403, userMessage: '请先完善身体档案', retryable: false },
  CHECK_007: { code: 'CHECK_007', httpStatus: 429, userMessage: '操作过于频繁，请稍后再试', retryable: true },
  CHECK_008: { code: 'CHECK_008', httpStatus: 503, userMessage: '清单服务暂时不可用，请稍后重试', retryable: true },
  CHECK_009: { code: 'CHECK_009', httpStatus: 500, userMessage: '操作失败，请稍后重试', retryable: true },
  CHECK_010: { code: 'CHECK_010', httpStatus: 400, userMessage: '日期格式有误，请重试', retryable: false },
  CHECK_011: { code: 'CHECK_011', httpStatus: 409, userMessage: '记录已存在', retryable: false },
  CHECK_012: { code: 'CHECK_012', httpStatus: 413, userMessage: '请求内容过大', retryable: false }
} as const;

export type CheckErrorCode = keyof typeof CHECK_ERROR_CODES;

export function checkMessage(code: string | undefined): string {
  if (code && code in CHECK_ERROR_CODES) {
    return CHECK_ERROR_CODES[code as CheckErrorCode].userMessage;
  }
  return '操作失败，请稍后重试';
}