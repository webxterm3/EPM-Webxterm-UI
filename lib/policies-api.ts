import { apiRequest } from './api-client';

export type PolicyAction = 'allow' | 'block' | 'elevate' | 'default';
export type PolicyScopeKind = 'tenant' | 'group' | 'machine';
export type MatchOp = 'equals' | 'contains' | 'prefix' | 'suffix' | 'wildcard';

export interface StringMatch {
  op?: MatchOp;
  values?: string[];
  case_sensitive?: boolean;
}

/** Populated fields are ANDed; values within a field are ORed.
 *  Criteria with nothing set match NOTHING — never everything. */
export interface MatchCriteria {
  app_name: StringMatch;
  publisher: StringMatch;
  file_path: StringMatch;
  bundle_id: StringMatch;
  sha256?: string[];
}

export interface PolicyRule {
  id: string;
  name: string;
  enabled: boolean;
  action: PolicyAction;
  match: MatchCriteria;
  comment?: string;
}

export interface PolicyScope {
  kind: PolicyScopeKind;
  group_ids?: string[];
  agent_ids?: string[];
}

export interface AppPolicy {
  id?: string;
  tenant_id?: string;
  name: string;
  description?: string;
  enabled: boolean;
  scope: PolicyScope;
  /** "audit" or "enforce".
   *
   *  Enforce is a request, not a guarantee: the resolver forces audit unless
   *  the tenant's own enforcement switch is also on, so a policy saved as
   *  enforce cannot act by itself. */
  mode: string;
  priority: number;
  default_action: PolicyAction;
  /** Make a block bite harder: software a RULE matched is MOVED off the
   *  machine rather than only stopped from launching.
   *
   *  A move, never a delete. The agent puts it back when the policy stops
   *  blocking it, and when the agent is uninstalled. Unavailable on an
   *  allow-list policy (default_action "block"), where the catch-all would
   *  sweep up everything the rules did not name. */
  remove_blocked?: boolean;
  rules: PolicyRule[];
  created_at?: string;
  updated_at?: string;
}

export interface Bucket {
  apps: number;
  machines: number;
  installs: number;
}

export interface AppImpact {
  name: string;
  publisher: string;
  action: PolicyAction;
  machine_count: number;
  rule_name: string;
  policy_name: string;
}

export interface MachineImpact {
  agent_id: string;
  machine_name: string;
  blocked: number;
  elevated: number;
}

export interface Conflict {
  scope: string;
  policy_a: string;
  policy_b: string;
  rule_a: string;
  rule_b: string;
  explanation: string;
}

export interface Simulation {
  summary: {
    machines_evaluated: number;
    machines_affected: number;
    apps_evaluated: number;
    installs_matched: number;
  };
  by_action: Record<string, Bucket>;
  top_apps: AppImpact[] | null;
  machines: MachineImpact[] | null;
  conflicts?: Conflict[] | null;
  /** Every way this projection differs from what would actually happen. The
   *  backend returns these so the UI cannot quietly omit them. */
  limits: string[];
}

export interface SimulationResponse {
  simulation: Simulation;
  coverage: {
    machines_total: number;
    machines_reported: number;
    machines_stale: number;
  };
  enforcement_enabled: boolean;
}

export interface PolicyListResponse {
  policies: AppPolicy[] | null;
  enforcement_enabled: boolean;
  /** Whether an alert about this fleet would actually be delivered. False
   *  means the server has no SMTP configured, so notifications are silently
   *  dropped — which is indistinguishable from a quiet fleet unless it is
   *  said. */
  email_notifications?: boolean;
}

export const policiesAPI = {
  list: async (token: string): Promise<PolicyListResponse> =>
    apiRequest<PolicyListResponse>('/app-policies', { token }),

  get: async (token: string, id: string): Promise<AppPolicy> =>
    apiRequest<AppPolicy>(`/app-policies/${id}`, { token }),

  create: async (token: string, policy: AppPolicy): Promise<AppPolicy> =>
    apiRequest<AppPolicy>('/app-policies', {
      method: 'POST',
      token,
      body: JSON.stringify(policy),
    }),

  update: async (token: string, id: string, policy: AppPolicy): Promise<AppPolicy> =>
    apiRequest<AppPolicy>(`/app-policies/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(policy),
    }),

  remove: async (token: string, id: string): Promise<{ message: string }> =>
    apiRequest<{ message: string }>(`/app-policies/${id}`, { method: 'DELETE', token }),

  /** Project what a draft would do. Nothing is saved and nothing is sent to
   *  any machine. */
  simulate: async (token: string, policy: AppPolicy): Promise<SimulationResponse> =>
    apiRequest<SimulationResponse>('/app-policies/simulate', {
      method: 'POST',
      token,
      body: JSON.stringify({ policy }),
    }),
};

/** An empty criteria set matches nothing, so the editor has to be able to tell
 *  whether a rule is actually constrained before offering to save it. */
export function criteriaAreEmpty(c: MatchCriteria): boolean {
  const empty = (m?: StringMatch) => !m?.values?.some(v => v.trim() !== '');
  return (
    empty(c.app_name) &&
    empty(c.publisher) &&
    empty(c.file_path) &&
    empty(c.bundle_id) &&
    !(c.sha256 ?? []).some(v => v.trim() !== '')
  );
}

export function emptyCriteria(): MatchCriteria {
  return {
    app_name: { op: 'equals', values: [] },
    publisher: { op: 'equals', values: [] },
    file_path: { op: 'contains', values: [] },
    bundle_id: { op: 'equals', values: [] },
  };
}
