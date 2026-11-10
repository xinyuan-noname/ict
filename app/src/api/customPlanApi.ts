import { ApiClient } from './client';
import { clientAllowInsecure, clientBaseUrl } from '../shared/config';
import type { CustomPlan } from '../model/customPlan';

export interface GenerateCustomPlanResult {
  plan: CustomPlan;
  traceId: string;
}

export class CustomPlanApi {
  private readonly client: ApiClient;

  constructor(client?: ApiClient) {
    this.client =
      client ??
      new ApiClient({
        baseUrl: clientBaseUrl(),
        allowInsecure: clientAllowInsecure(),
        timeoutMs: 65000
      });
  }

  async generate(token: string, need: string): Promise<GenerateCustomPlanResult> {
    const response = await this.client.request<GenerateCustomPlanResult>('/v1/custom-plans/generate', {
      method: 'POST',
      token,
      body: { need }
    });
    return response.data;
  }
}
