import { apiRequest } from './api-client';

/** One user account on one machine, as last reported by its agent. */
export interface LocalAccount {
  id: string;
  agent_id: string;
  machine_name: string;
  /** Stable per-machine identity: "uid:501" on macOS, "sid:S-1-5-…" on
   *  Windows. Never the username, which can be renamed without anything about
   *  the account's rights changing. */
  account_key: string;
  username: string;
  full_name?: string;
  uid?: number;
  sid?: string;
  /** Holds local administrator rights. The field this whole view exists for. */
  is_admin: boolean;
  /** An account this machine owns, as opposed to one it recognises because it
   *  is joined to a directory. A directory account's rights are not removable
   *  with a local group edit. */
  is_local: boolean;
  /** Whether policy could remove this account's administrator rights.
   *
   *  Narrower than is_admin: root, the Windows built-ins and directory
   *  accounts are all administrators that this product will not demote. The
   *  gap between the two counts is what an operator needs to see before
   *  planning a rollout. */
  demotable: boolean;
  source: string;
  shell?: string;
  home_dir?: string;
  disabled?: boolean;
  /** Excluded from the login window. Hidden and admin together is what a
   *  backdoor account looks like. */
  hidden?: boolean;
  last_login?: string;
  /** When this account was first seen holding administrator rights. It is what
   *  turns a list into evidence: "has held local admin since March" is a
   *  finding, "holds local admin" is only a status. */
  admin_since?: string;
  /** When a time-limited grant of administrator rights ends.
   *
   *  Absent means the rights do not expire — the stronger statement of the
   *  two, which is why it is absent rather than a zero date that would read
   *  as "expired long ago". */
  admin_until?: string;
  first_seen: string;
  last_seen: string;
  /** False once a scan stopped reporting it. Rows are kept, not deleted, so
   *  "who held administrator rights in March" stays answerable. */
  present: boolean;
  removed_at?: string;
}

export interface MachineAccountsResponse {
  accounts: LocalAccount[];
  total: number;
  administrators: number;
  demotable: number;
  /** False means the machine has never reported, which is a different thing
   *  from having no accounts — and no machine has no accounts. */
  reported: boolean;
}

export interface FleetAccountsResponse {
  accounts: LocalAccount[];
  total: number;
  /** These count the returned page, not the fleet. Named so they cannot be
   *  mistaken for a fleet-wide total and quietly understate a large estate. */
  page_administrators: number;
  page_demotable: number;
}

export interface AccountFilters {
  adminsOnly?: boolean;
  demotableOnly?: boolean;
  includeRemoved?: boolean;
  search?: string;
  limit?: number;
  skip?: number;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

function filterQuery(opts: AccountFilters): string {
  return query({
    admins_only: opts.adminsOnly,
    demotable_only: opts.demotableOnly,
    include_removed: opts.includeRemoved,
    search: opts.search,
    limit: opts.limit,
    skip: opts.skip,
  });
}

/** An account an administrator is asking to create on a machine.
 *
 *  The password travels from this browser to the endpoint and is used once.
 *  It is never stored — not in the database, not in the audit trail, not in a
 *  log on either side — so it cannot be retrieved afterwards. Whoever creates
 *  the account is the only person who knows it. */
export interface NewAccount {
  username: string;
  full_name?: string;
  password: string;
  /** Makes it a local administrator. Defaults to false, which is the point of
   *  this product: an administrator created here is a standing way around
   *  everything least privilege enforces on that machine. */
  admin?: boolean;
  hidden?: boolean;
}

/** What an administrator can do to an existing account.
 *
 *  Deliberately no delete. A deleted account takes its home directory and its
 *  file ownership with it, and on Windows a replacement with the same name
 *  gets a different SID — orphaning everything that referenced the old one,
 *  including this product's own record of who held rights and when. Disabling
 *  answers the same need and is reversible. */
export type AccountActionKind = 'set-admin' | 'set-enabled';

export interface AccountActionRequest {
  action: AccountActionKind;
  username: string;
  value: boolean;
  /** Bounds a grant of administrator rights, counted from when the endpoint
   *  receives it. Omit or 0 for one that does not end. The endpoint removes
   *  the rights itself when the time is up, and keeps doing so across
   *  restarts and while the machine is offline. */
  duration_minutes?: number;

  /** An absolute end time, for when somebody picked a date rather than a
   *  length.
   *
   *  Must carry an offset — send `new Date(...).toISOString()`, never a bare
   *  "2026-11-12T17:00". A naive wall clock would mean five o'clock in
   *  whichever timezone the server runs in, which is nobody's five o'clock.
   *
   *  Wins over duration_minutes when both are sent. */
  until?: string;
}

export const accountsAPI = {
  /** The accounts on one machine. */
  forMachine: async (
    token: string,
    agentId: string,
    opts: AccountFilters = {},
  ): Promise<MachineAccountsResponse> =>
    apiRequest<MachineAccountsResponse>(
      `/machines/${encodeURIComponent(agentId)}/accounts` + filterQuery(opts),
      { token },
    ),

  /** Accounts across the fleet — the view that answers "how many people hold
   *  local administrator rights". */
  fleet: async (token: string, opts: AccountFilters = {}): Promise<FleetAccountsResponse> =>
    apiRequest<FleetAccountsResponse>('/accounts' + filterQuery(opts), { token }),

  /** Create a local account on one machine.
   *
   *  Answers when the request has been handed to the agent, which is all the
   *  backend can honestly report: the account is created a second or two
   *  later and appears in the list once the machine confirms it. */
  create: async (
    token: string,
    agentId: string,
    account: NewAccount,
  ): Promise<{ requested: boolean; message: string }> =>
    apiRequest<{ requested: boolean; message: string }>(
      `/machines/${encodeURIComponent(agentId)}/accounts`,
      { token, method: 'POST', body: JSON.stringify(account) },
    ),

  /** Change one account: its administrator rights, or whether it is enabled.
   *
   *  Answers when the request has been handed to the agent. The change lands
   *  a second or two later and the list reflects it once the machine
   *  confirms — the endpoint can still refuse. */
  manage: async (
    token: string,
    agentId: string,
    action: AccountActionRequest,
  ): Promise<{ requested: boolean; message: string }> =>
    apiRequest<{ requested: boolean; message: string }>(
      `/machines/${encodeURIComponent(agentId)}/account-action`,
      { token, method: 'POST', body: JSON.stringify(action) },
    ),

  /** Ask one machine to re-scan its accounts now.
   *
   *  Returns when the request has been handed to the agent, which is all the
   *  backend can honestly report: the result arrives seconds later through the
   *  normal inventory channel.
   */
  requestScan: async (
    token: string,
    agentId: string,
  ): Promise<{ requested: boolean; message: string }> =>
    apiRequest<{ requested: boolean; message: string }>(
      `/machines/${encodeURIComponent(agentId)}/accounts/scan`,
      { token, method: 'POST' },
    ),
};
