import { apiRequest } from './api-client';

/** A tenant's application-control configuration.
 *
 *  Today it holds one thing, and that one thing decides whether this product
 *  watches or acts on somebody's laptop. */
export interface AppControlSettings {
  tenant_id: string;
  /** While false, every policy resolves to audit however its own mode is set,
   *  and no endpoint acts on anything. */
  enforcement: boolean;
  updated_at?: string;
  updated_by?: string;
}

/** What an agent did, or declined to do, to the software on a machine.
 *
 *  "terminate" closed a running program; "launch-lock" stopped one from
 *  starting; "launch-unlock" restored one that is no longer blocked;
 *  "refused" means the agent declined a whole policy because applying it
 *  would have blocked an implausible number of applications at once. */
export type EnforcementMechanism =
  | 'terminate'
  | 'launch-lock'
  | 'launch-unlock'
  | 'quarantine'
  | 'restore'
  | 'refused';

export interface EnforcementEvent {
  id: string;
  agent_id: string;
  machine_id?: string;
  machine_name?: string;
  /** When it happened on the endpoint. */
  at: string;
  /** When it reached the server. The gap is however long the machine was
   *  offline, which is itself worth seeing. */
  created_at: string;
  mechanism: EnforcementMechanism | string;
  outcome: 'applied' | 'failed' | 'skipped' | string;
  app_name?: string;
  path?: string;
  bundle_id?: string;
  /** Empty rule AND policy means the policy's default action decided, not any
   *  rule — a different conversation to have with whoever's software stopped. */
  rule?: string;
  policy?: string;
  pid?: number;
  detail?: string;
  /** How that endpoint prevents launches, which differs by platform. */
  enforced_by?: string;
}

export interface EnforcementEventsResponse {
  events: EnforcementEvent[];
  total: number;
  page: number;
  limit: number;
  enforcement_enabled: boolean;
}

export const appControlAPI = {
  getSettings: async (token: string): Promise<AppControlSettings> =>
    apiRequest<AppControlSettings>('/app-control/settings', { token }),

  setEnforcement: async (
    token: string,
    enforcement: boolean,
  ): Promise<{ enforcement: boolean; message: string }> =>
    apiRequest<{ enforcement: boolean; message: string }>('/app-control/settings', {
      method: 'PUT',
      token,
      body: JSON.stringify({ enforcement }),
    }),

  events: async (
    token: string,
    opts: { page?: number; limit?: number; agentId?: string } = {},
  ): Promise<EnforcementEventsResponse> => {
    const q = new URLSearchParams();
    if (opts.page) q.set('page', String(opts.page));
    if (opts.limit) q.set('limit', String(opts.limit));
    if (opts.agentId) q.set('agent_id', opts.agentId);
    const qs = q.toString();
    return apiRequest<EnforcementEventsResponse>(`/app-control/events${qs ? `?${qs}` : ''}`, {
      token,
    });
  },
};

/** How a mechanism is described to somebody reading the activity list. */
export function describeMechanism(m: string): string {
  switch (m) {
    case 'terminate':
      return 'Closed while running';
    case 'launch-lock':
      return 'Blocked from launching';
    case 'launch-unlock':
      return 'Restored';
    case 'quarantine':
      return 'Removed from the machine';
    case 'restore':
      return 'Put back';
    case 'refused':
      return 'Policy refused';
    default:
      return m;
  }
}

/** How launch prevention works on the endpoint that reported it.
 *
 *  Spelled out rather than hidden because the two mechanisms are not equally
 *  strong, and an operator deciding whether to rely on this needs to know
 *  which one their fleet is actually using. */
export function describeEnforcedBy(by?: string): string {
  switch (by) {
    case 'image-file-execution-options':
      return 'Windows refuses the launch (Image File Execution Options)';
    case 'execute-bit':
      return "macOS: the application's binary is not executable";
    case 'unsupported':
      return 'This platform cannot prevent launches';
    default:
      return by ?? '';
  }
}
