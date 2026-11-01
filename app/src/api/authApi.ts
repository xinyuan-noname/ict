import { ApiClient, type RawResponse } from './client';

export type Platform = 'android' | 'ios' | 'windows';

export interface UserBrief {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface LoginRequest {
  platform: Platform;
  authCode: string;
  redirectUri?: string;
  clientVersion: string;
  deviceLabel?: string;
}

export interface LoginResult {
  sessionToken: string;
  expiresAt: string;
  user: UserBrief;
  firstLogin: boolean;
  traceId: string;
}

export interface ValidateResult {
  valid: boolean;
  user: UserBrief;
  expiresAt: string;
  sessionToken?: string;
  traceId: string;
}

export interface MeResult {
  user: UserBrief;
  platform: Platform;
  expiresAt: string;
  traceId: string;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'fail';
  version: string;
  env: string;
  checks: { config: string; storage: string; huawei: string };
  time: string;
}

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  login(req: LoginRequest): Promise<RawResponse<LoginResult>> {
    return this.client.request<LoginResult>('/v1/auth/huawei/login', { method: 'POST', body: req });
  }

  validate(sessionToken: string): Promise<RawResponse<ValidateResult>> {
    return this.client.request<ValidateResult>('/v1/auth/session/validate', {
      method: 'POST',
      body: { sessionToken }
    });
  }

  logout(sessionToken: string): Promise<RawResponse<{ success: boolean; traceId: string }>> {
    return this.client.request('/v1/auth/logout', { method: 'POST', body: { sessionToken } });
  }

  me(sessionToken: string): Promise<RawResponse<MeResult>> {
    return this.client.request<MeResult>('/v1/auth/me', { token: sessionToken });
  }

  health(): Promise<RawResponse<HealthResult>> {
    return this.client.request<HealthResult>('/v1/health');
  }
}