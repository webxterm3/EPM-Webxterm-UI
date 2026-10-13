import { apiRequest } from './api-client';

/** One application installed on one machine, as last reported by its agent. */
export interface InstalledApp {
  id: string;
  agent_id: string;
  machine_name: string;
  name: string;
  version?: string;
  publisher?: string;
  install_path?: string;
  exe_path?: string;
  bundle_id?: string;
  source: string;
  /** "machine" or "user" — a per-user install is software someone added
   *  without admin rights, which is the interesting case for least privilege. */
  scope?: string;
  os_user?: string;
  arch?: string;
  installed_at?: string;
  first_seen: string;
  last_seen: string;
  /** False once a scan stopped reporting it. Rows are kept, not deleted, so
   *  "what was uninstalled last week" stays answerable. */
  present: boolean;
  removed_at?: string;
}

/** One reported snapshot. Its absence is what distinguishes "no software" from
 *  "never reported". */
export interface InventoryScan {
  scan_id: string;
  os?: string;
  agent_version?: string;
  reported: number;
  added: number;
  updated: number;
  removed: number;
  collect_error?: string;
  complete: boolean;
  started_at: string;
  finished_at?: string;
}

/** One distinct application across the fleet. */
export interface CatalogEntry {
  name: string;
  publisher: string;
  machine_count: number;
  install_count: number;
  version_count: number;
  versions: string[];
  sample_exe?: string;
  sample_bundle?: string;
}

/** How much of the fleet the inventory actually covers. Every count derived
 *  from the inventory is only as honest as this. */
export interface InventoryCoverage {
  machines_total: number;
  machines_reported: number;
  machines_stale: number;
  oldest_report_at?: string;
}

export interface MachineApplicationsResponse {
  applications: InstalledApp[];
  total: number;
  last_scan: InventoryScan | null;
}

export interface CatalogResponse {
  applications: CatalogEntry[];
  total: number;
  coverage: InventoryCoverage;
}

export interface MachinesWithAppResponse {
  installs: InstalledApp[];
  total: number;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const applicationsAPI = {
  /** Software installed on one machine. */
  forMachine: async (
    token: string,
    agentId: string,
    opts: { search?: string; includeRemoved?: boolean; limit?: number; skip?: number } = {},
  ): Promise<MachineApplicationsResponse> =>
    apiRequest<MachineApplicationsResponse>(
      `/machines/${encodeURIComponent(agentId)}/applications` +
        query({
          search: opts.search,
          include_removed: opts.includeRemoved,
          limit: opts.limit,
          skip: opts.skip,
        }),
      { token },
    ),

  /** Ask one machine to re-scan its software now.
   *
   *  Returns when the request has been handed to the agent, which is all the
   *  backend can honestly report: the result arrives later through the normal
   *  inventory channel.
   */
  requestScan: async (token: string, agentId: string): Promise<{ requested: boolean; message: string }> =>
    apiRequest<{ requested: boolean; message: string }>(
      `/machines/${encodeURIComponent(agentId)}/applications/scan`,
      { token, method: 'POST' },
    ),

  /** Ask every connected machine in the tenant to re-scan now.
   *
   *  Offline machines are reported, not treated as a failure: a fleet always
   *  has some asleep, and the caller needs the number to know how complete the
   *  refreshed catalog is.
   */
  requestFleetScan: async (
    token: string,
  ): Promise<{ requested: number; offline: number; failed: string[]; total: number }> =>
    apiRequest<{ requested: number; offline: number; failed: string[]; total: number }>(
      '/applications/scan',
      { token, method: 'POST' },
    ),

  /** The fleet-wide catalog of distinct applications. */
  catalog: async (
    token: string,
    opts: { search?: string; limit?: number; skip?: number } = {},
  ): Promise<CatalogResponse> =>
    apiRequest<CatalogResponse>(
      `/applications/catalog` + query({ search: opts.search, limit: opts.limit, skip: opts.skip }),
      { token },
    ),

  /** Which machines carry one catalog entry. */
  machinesWith: async (
    token: string,
    name: string,
    publisher?: string,
    opts: { limit?: number; skip?: number } = {},
  ): Promise<MachinesWithAppResponse> =>
    apiRequest<MachinesWithAppResponse>(
      `/applications/machines` +
        query({ name, publisher, limit: opts.limit, skip: opts.skip }),
      { token },
    ),
};
