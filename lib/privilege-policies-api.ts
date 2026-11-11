import { apiRequest } from './api-client';
import { PolicyScope } from './policies-api';

/** The break-glass account: the machine's guaranteed way back in. */
export interface BreakGlassSpec {
  enabled: boolean;
  username?: string;
  full_name?: string;
  /** Keeps it out of the login window. Off by default on purpose — a hidden
   *  administrator account is also exactly what a backdoor looks like, and the
   *  account inventory flags that combination. */
  hidden?: boolean;
}

/** One command a demoted user may still run as root. */
export interface SudoCommand {
  /** Absolute. sudoers matches the path as written, so a bare name would
   *  resolve through the user's own PATH. */
  path: string;
  args?: string[];
  /** Explicit rather than implied by an empty args list, because sudoers has
   *  this backwards from what people expect: a bare command permits ANY
   *  arguments, and permitting none requires an empty string. */
  any_arguments?: boolean;
  no_password?: boolean;
}

/** How privilege is regained for a task once standing rights are gone. */
export interface ElevationSpec {
  allow_install_requests: boolean;
  allow_admin_requests: boolean;
  max_grant_minutes?: number;
  /** Restores real administrator-group membership for the window, rather than
   *  only task-scoped grants. Off by default and separately named: during such
   *  a window the person can stop the agent. */
  allow_full_admin_grant?: boolean;
  sudo_commands?: SudoCommand[];
}

/** A least-privilege policy: who may hold local administrator rights. */
export interface PrivilegePolicy {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  scope: PolicyScope;
  /** audit | enforce. Enforce only bites while the organisation's privilege
   *  enforcement switch is also on — a different switch from application
   *  control's. */
  mode: string;
  priority: number;
  /** The instruction itself. */
  demote_admins: boolean;
  keep_admin?: string[];
  break_glass: BreakGlassSpec;
  elevation: ElevationSpec;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  /** How many machines this policy actually reaches. Absent means it was not
   *  computed, which is not the same as zero — zero is a warning worth
   *  showing, absent is a database hiccup and must not produce one. */
  machines_in_scope?: number;
}

/** One administrator a policy would not touch, and why. */
export interface KeptAccount {
  username: string;
  reason: string;
}

/** One machine's outcome under a draft policy. */
export interface PrivilegeChange {
  agent_id: string;
  machine_name: string;
  demoted?: string[];
  kept?: KeptAccount[];
  /** Set when a safety invariant stopped the whole machine. When it is set,
   *  nothing on that machine changes — refusal is all-or-nothing. */
  refused?: string;
}

/** What a draft policy would do across the fleet. */
export interface PrivilegeSimulation {
  machines_in_scope: number;
  machines_affected: number;
  accounts_demoted: number;
  accounts_exempt: number;
  /** Machines where the endpoint would apply nothing because demoting would
   *  leave no administrator at all. Not the policy declining to act — the
   *  safety invariant stopping it. */
  machines_refused: number;
  /** Machines with no account inventory. Every number above is only as
   *  complete as this one is small. */
  machines_not_reported: number;
  changes?: PrivilegeChange[];
}

export interface PrivilegePolicyListResponse {
  policies: PrivilegePolicy[];
  enforcement_enabled: boolean;
}

export interface PrivilegeSimulationResponse {
  simulation: PrivilegeSimulation;
  enforcement_enabled: boolean;
}

export const privilegePoliciesAPI = {
  list: async (token: string): Promise<PrivilegePolicyListResponse> =>
    apiRequest<PrivilegePolicyListResponse>('/privilege-policies', { token }),

  get: async (token: string, id: string): Promise<{ policy: PrivilegePolicy }> =>
    apiRequest<{ policy: PrivilegePolicy }>(`/privilege-policies/${encodeURIComponent(id)}`, {
      token,
    }),

  create: async (
    token: string,
    policy: Partial<PrivilegePolicy>,
  ): Promise<{ policy: PrivilegePolicy }> =>
    apiRequest<{ policy: PrivilegePolicy }>('/privilege-policies', {
      token,
      method: 'POST',
      body: JSON.stringify(policy),
    }),

  update: async (
    token: string,
    id: string,
    policy: Partial<PrivilegePolicy>,
  ): Promise<{ policy: PrivilegePolicy }> =>
    apiRequest<{ policy: PrivilegePolicy }>(`/privilege-policies/${encodeURIComponent(id)}`, {
      token,
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  remove: async (token: string, id: string): Promise<{ deleted: boolean }> =>
    apiRequest<{ deleted: boolean }>(`/privilege-policies/${encodeURIComponent(id)}`, {
      token,
      method: 'DELETE',
    }),

  /** What this draft would do. Nothing is saved and no machine is contacted. */
  simulate: async (
    token: string,
    policy: Partial<PrivilegePolicy>,
  ): Promise<PrivilegeSimulationResponse> =>
    apiRequest<PrivilegeSimulationResponse>('/privilege-policies/simulate', {
      token,
      method: 'POST',
      body: JSON.stringify(policy),
    }),

  getEnforcement: async (token: string): Promise<{ enforcement: boolean }> =>
    apiRequest<{ enforcement: boolean }>('/privilege-control/settings', { token }),

  setEnforcement: async (token: string, enforcement: boolean): Promise<{ enforcement: boolean }> =>
    apiRequest<{ enforcement: boolean }>('/privilege-control/settings', {
      token,
      method: 'PUT',
      body: JSON.stringify({ enforcement }),
    }),
};

/** A new, empty policy.
 *
 *  Every default here is the safe one: not enabled, audit mode, does not
 *  demote, tenant scope. Somebody who saves this form without reading it must
 *  not have stripped their fleet.
 */
export function newPrivilegePolicy(): Partial<PrivilegePolicy> {
  return {
    name: '',
    enabled: false,
    mode: 'audit',
    priority: 0,
    demote_admins: false,
    keep_admin: [],
    scope: { kind: 'tenant' },
    break_glass: { enabled: true, username: 'vsay-recovery', full_name: 'Managed recovery account' },
    elevation: {
      allow_install_requests: true,
      allow_admin_requests: true,
      max_grant_minutes: 60,
      sudo_commands: [],
    },
  };
}
