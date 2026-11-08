import type { ApiClient } from './client';

export interface HealthChecks {
  config: string;
  storage: string;
  huawei: string;
  rds?: string;
  redis?: string;
  maas?: string;
}

export interface HealthCloud {
  region?: string;
  deploymentId?: string;
  provider?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  env: string;
  checks: HealthChecks;
  cloud?: HealthCloud;
  time: string;
  traceId?: string;
}

export class SystemApi {
  constructor(private readonly client: ApiClient) {}

  health(): Promise<{ data: HealthResponse; traceId: string }> {
    return this.client.request<HealthResponse>('/v1/health');
  }
}
