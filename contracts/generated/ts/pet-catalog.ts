// 构建期产物，勿手改。由 contracts/pet-error-codes.json 生成。
export const PET_ERROR_CODES = {
  PET_001: { code: 'PET_001', httpStatus: 400, userMessage: '请求参数有误，请重试', retryable: false },
  PET_002: { code: 'PET_002', httpStatus: 404, userMessage: '请先领养宠物', retryable: false },
  PET_003: { code: 'PET_003', httpStatus: 409, userMessage: '你已经有宠物了', retryable: false },
  PET_004: { code: 'PET_004', httpStatus: 409, userMessage: '今日改名次数已用完', retryable: false },
  PET_005: { code: 'PET_005', httpStatus: 409, userMessage: '没有可分配的点数', retryable: false },
  PET_006: { code: 'PET_006', httpStatus: 422, userMessage: '该属性已达上限', retryable: false },
  PET_007: { code: 'PET_007', httpStatus: 503, userMessage: '宠物服务暂时不可用', retryable: true },
  PET_008: { code: 'PET_008', httpStatus: 500, userMessage: '操作失败，请稍后重试', retryable: true },
  ITEM_001: { code: 'ITEM_001', httpStatus: 404, userMessage: '道具不存在', retryable: false },
  ITEM_002: { code: 'ITEM_002', httpStatus: 409, userMessage: '道具数量不足', retryable: false },
  ITEM_003: { code: 'ITEM_003', httpStatus: 409, userMessage: '请求冲突，请重新提交', retryable: false },
  ITEM_004: { code: 'ITEM_004', httpStatus: 410, userMessage: '该道具已下架', retryable: false },
  ITEM_005: { code: 'ITEM_005', httpStatus: 403, userMessage: '游客模式暂不支持该道具', retryable: false },
  ITEM_006: { code: 'ITEM_006', httpStatus: 503, userMessage: '道具服务暂时不可用', retryable: true },
  FRIEND_001: { code: 'FRIEND_001', httpStatus: 400, userMessage: '邀请码格式有误', retryable: false },
  FRIEND_002: { code: 'FRIEND_002', httpStatus: 409, userMessage: '邀请码无效或已过期', retryable: false },
  FRIEND_003: { code: 'FRIEND_003', httpStatus: 409, userMessage: '好友数量已达上限', retryable: false },
  FRIEND_004: { code: 'FRIEND_004', httpStatus: 409, userMessage: '你们已经是好友了', retryable: false },
  FRIEND_005: { code: 'FRIEND_005', httpStatus: 403, userMessage: '请先登录后再使用好友功能', retryable: false },
  FRIEND_006: { code: 'FRIEND_006', httpStatus: 404, userMessage: '好友不存在', retryable: false },
  PK_001: { code: 'PK_001', httpStatus: 400, userMessage: '请求参数有误', retryable: false },
  PK_002: { code: 'PK_002', httpStatus: 403, userMessage: '仅可向好友发起 PK', retryable: false },
  PK_003: { code: 'PK_003', httpStatus: 409, userMessage: '对局已过期', retryable: false },
  PK_004: { code: 'PK_004', httpStatus: 429, userMessage: '今日 PK 次数已用完', retryable: true },
  PK_005: { code: 'PK_005', httpStatus: 409, userMessage: '该对局已结算', retryable: false },
  PK_006: { code: 'PK_006', httpStatus: 403, userMessage: '无权操作该对局', retryable: false },
  PK_007: { code: 'PK_007', httpStatus: 409, userMessage: '今日已与该好友 PK 过', retryable: false },
  PK_008: { code: 'PK_008', httpStatus: 503, userMessage: 'PK 服务暂时不可用', retryable: true }
} as const;

export type PetErrorCode = keyof typeof PET_ERROR_CODES;

export function petMessage(code: string | undefined): string {
  if (code && code in PET_ERROR_CODES) {
    return PET_ERROR_CODES[code as PetErrorCode].userMessage;
  }
  return '操作失败，请稍后重试';
}