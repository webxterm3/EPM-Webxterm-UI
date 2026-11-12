import { apiRequest } from './api-client';

export interface LicenseStatus {
  license_id: string;
  company: string;
  plan: string;
  machine_quota: number;
  expires_at: string | null;
  days_remaining: number | null;
  state: 'ok' | 'grace' | 'locked' | 'dev';
  state_label: string;
  enforcement: boolean;
  message?: string;
}

export async function getLicenseStatus(token: string): Promise<LicenseStatus> {
  return apiRequest<LicenseStatus>('/license/status', { token });
}
