import { apiRequest } from './api-client';

export interface S3Config {
  enabled: boolean;
  endpoint: string;
  protocol: 'http' | 'https';
  access_key: string;
  secret_key?: string;      // only sent on save; never returned
  secret_key_set?: boolean; // returned from API: true if a key is already stored
  bucket: string;
  region: string;
}

/** Tenant-wide policy for collecting each machine's OWN system logs — the
 *  Windows Event Log, the macOS unified log, and website activity derived from
 *  DNS. Distinct from Log Management, which archives the portal's audit log. */
export interface LogShippingConfig {
  enabled: boolean;
  system_logs: boolean;
  websites: boolean;
  interval_seconds: number;
  daily_budget_mb: number;
  backfill_hours: number;
  include_info_debug: boolean;
  keep_raw: boolean;
  windows_channels?: string[];
}

export interface LogShippingResponse {
  settings: LogShippingConfig;
  /** Collection discards everything when no archive destination exists, so the
   *  UI is told rather than having to infer it from the S3 tab. */
  archive_configured: boolean;
  default_daily_budget: number;
}

export interface LogShippingSaveResponse {
  message: string;
  /** How many machines took the change immediately. Offline ones apply it when
   *  they reconnect, so these two numbers usually differ. */
  agents_updated: number;
  agents_total: number;
  archive_configured: boolean;
}

export const settingsAPI = {
  getS3Config: async (token: string): Promise<S3Config> => {
    return apiRequest<S3Config>('/config/s3', { token });
  },

  /** Check that the session-recording bucket actually answers.
   *
   *  An empty secret_key means "test what is stored", matching save: the
   *  form shows the stored key as dots, so a test over an existing
   *  configuration sends none — and testing with an empty secret would
   *  fail every time and call a working setup broken.
   */
  testS3Config: async (token: string, config: S3Config): Promise<{ status: string }> => {
    return apiRequest<{ status: string }>('/config/s3/test', {
      method: 'POST',
      token,
      body: JSON.stringify(config),
    });
  },

  saveS3Config: async (token: string, config: S3Config): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>('/config/s3', {
      method: 'POST',
      token,
      body: JSON.stringify(config),
    });
  },

  getLogShippingConfig: async (token: string): Promise<LogShippingResponse> => {
    return apiRequest<LogShippingResponse>('/config/log-shipping', { token });
  },

  saveLogShippingConfig: async (
    token: string,
    config: LogShippingConfig,
  ): Promise<LogShippingSaveResponse> => {
    return apiRequest<LogShippingSaveResponse>('/config/log-shipping', {
      method: 'POST',
      token,
      body: JSON.stringify(config),
    });
  },
};
