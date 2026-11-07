import type { ApiClient } from '../src/api/client';
import { isCancelledResult, WeChatAuthApi } from '../src/api/wechatAuthApi';

function makeClient(): jest.Mocked<Pick<ApiClient, 'request'>> {
  return { request: jest.fn() } as unknown as jest.Mocked<Pick<ApiClient, 'request'>>;
}

describe('WeChatAuthApi', () => {
  test('authorize 只打独立端点且请求体不含平台/回跳', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({
      data: { authorizeUrl: 'https://open.weixin.qq.com/x', callbackPath: '/', expiresAt: '2026-11-07T08:10:00Z', traceId: 't' },
      traceId: 't'
    });
    const api = new WeChatAuthApi(client as unknown as ApiClient);

    await api.authorize();

    expect(client.request).toHaveBeenCalledWith('/v1/auth/wechat/authorize', {
      method: 'POST',
      body: {}
    });
  });

  test('callback 传递 code/state，取消分支可识别', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ data: { cancelled: true, traceId: 't' }, traceId: 't' });
    const api = new WeChatAuthApi(client as unknown as ApiClient);

    const { data } = await api.callback({ code: 'c1', state: 's1' });

    expect(client.request).toHaveBeenCalledWith('/v1/auth/wechat/callback', {
      method: 'POST',
      body: { code: 'c1', state: 's1' }
    });
    expect(isCancelledResult(data)).toBe(true);
  });

  test('availability 为只读 GET', async () => {
    const client = makeClient();
    client.request.mockResolvedValue({ data: { enabled: false, reason: 'disabled', traceId: 't' }, traceId: 't' });
    const api = new WeChatAuthApi(client as unknown as ApiClient);

    const { data } = await api.availability();

    expect(client.request).toHaveBeenCalledWith('/v1/auth/wechat/availability');
    expect(data.enabled).toBe(false);
  });
});