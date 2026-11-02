// 构建期产物，勿手改。由 contracts/reward-error-codes.json 生成。
export const REWARD_ERROR_CODES = {
  POINT_001: { code: 'POINT_001', httpStatus: 400, userMessage: '请求参数有误，请重试', retryable: false },
  POINT_002: { code: 'POINT_002', httpStatus: 409, userMessage: '积分不足，无法兑换', retryable: false },
  POINT_003: { code: 'POINT_003', httpStatus: 403, userMessage: '积分账户不可用，请联系管理员', retryable: false },
  POINT_004: { code: 'POINT_004', httpStatus: 429, userMessage: '操作过于频繁，请稍后再试', retryable: true },
  POINT_005: { code: 'POINT_005', httpStatus: 503, userMessage: '积分服务暂时不可用，请稍后重试', retryable: true },
  POINT_006: { code: 'POINT_006', httpStatus: 500, userMessage: '积分记录加载失败，请稍后重试', retryable: true },
  REWARD_001: { code: 'REWARD_001', httpStatus: 404, userMessage: '头像框不存在', retryable: false },
  REWARD_002: { code: 'REWARD_002', httpStatus: 409, userMessage: '该头像框已下架', retryable: false },
  REWARD_003: { code: 'REWARD_003', httpStatus: 409, userMessage: '你已拥有该头像框', retryable: false },
  REWARD_004: { code: 'REWARD_004', httpStatus: 403, userMessage: '尚未拥有该头像框', retryable: false },
  REWARD_005: { code: 'REWARD_005', httpStatus: 503, userMessage: '头像框服务暂时不可用，请稍后重试', retryable: true },
  REWARD_006: { code: 'REWARD_006', httpStatus: 409, userMessage: '请求冲突，请重新提交', retryable: false },
  REWARD_007: { code: 'REWARD_007', httpStatus: 409, userMessage: '头像框信息已更新，请刷新后重试', retryable: true },
  REWARD_008: { code: 'REWARD_008', httpStatus: 400, userMessage: '请求参数有误，请重试', retryable: false }
} as const;

export type RewardErrorCode = keyof typeof REWARD_ERROR_CODES;

export function rewardMessage(code: string | undefined): string {
  if (code && code in REWARD_ERROR_CODES) {
    return REWARD_ERROR_CODES[code as RewardErrorCode].userMessage;
  }
  return '操作失败，请稍后重试';
}