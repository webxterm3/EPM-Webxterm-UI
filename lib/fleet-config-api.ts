import { apiRequest } from './api-client';

/** The local account every newly enrolled machine gets.
 *
 *  Unlike the one-off account created from a machine's Accounts tab, this
 *  password IS stored — it has to survive until a machine that does not exist
 *  yet enrols, and the endpoint needs the real characters, so a hash is no
 *  use. The server encrypts it at rest and never sends it back. */
export interface DefaultUserConfig {
  enabled: boolean;
  username?: string;
  full_name?: string;
  /** Whether a password is set. The password itself is never returned: an API
   *  that handed back the credential for an account on every machine in the
   *  fleet is one browser extension away from being a leak. */
  has_password: boolean;
  /** Makes the default account a local administrator on every machine.
   *
   *  Off by default. An administrator created automatically everywhere is a
   *  standing way around everything least privilege enforces, on the whole
   *  fleet at once. */
  admin?: boolean;
  hidden?: boolean;
}

export interface FleetConfig {
  tenant_id: string;
  default_user: DefaultUserConfig;
  updated_at?: string;
  updated_by?: string;
}

export interface FleetConfigResponse {
  config: FleetConfig;
  /** False when the server has no encryption key configured, so a password
   *  cannot be stored. The screen explains that rather than showing a save
   *  failure nobody can act on. */
  secrets_available: boolean;
}

export interface FleetUpgradeResult {
  requested: number;
  offline: number;
  revoked: number;
  /** Machines the command could not be delivered to. */
  failed: string[];
  /** Machines whose platform has no published package. Not a failure —
   *  nothing is broken, there is simply nothing to send. */
  no_package: string[];
  total: number;
  message: string;
}

/** What the portal sends. The password travels only when it is being changed:
 *  an empty one leaves the stored password alone, so editing the full name
 *  does not require re-typing a credential nobody can read back. */
export interface FleetConfigUpdate {
  default_user: {
    enabled: boolean;
    username: string;
    full_name: string;
    password: string;
    admin: boolean;
    hidden: boolean;
  };
}

/** What applying the default account to the fleet produced. */
export interface DefaultUserSweep {
  requested: number;
  /** Machines that had it already — from an earlier run, or because they
   *  enrolled after the setting was turned on. */
  already_done: number;
  /** Not a failure. These are asked the moment they next connect, by the same
   *  hook that handles a brand-new enrolment. */
  offline: number;
  revoked: number;
  failed: string[];
  total: number;
}

export const fleetConfigAPI = {
  get: async (token: string): Promise<FleetConfigResponse> =>
    apiRequest<FleetConfigResponse>('/fleet-config', { token }),

  /** Saves the configuration AND applies the default account to machines that
   *  already exist — otherwise the setting only ever reaches machines that
   *  enrol afterwards, which on an estate already enrolled is almost nobody. */
  save: async (
    token: string,
    update: FleetConfigUpdate,
  ): Promise<{ config: FleetConfig; sweep?: DefaultUserSweep }> =>
    apiRequest<{ config: FleetConfig; sweep?: DefaultUserSweep }>('/fleet-config', {
      token,
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  /** Ask every machine that has not had the default account yet.
   *
   *  Safe to run repeatedly: a machine that has already been asked is
   *  skipped, so this never creates duplicate requests. */
  applyDefaultUser: async (token: string): Promise<{ sweep: DefaultUserSweep }> =>
    apiRequest<{ sweep: DefaultUserSweep }>('/fleet-config/apply-default-user', {
      token,
      method: 'POST',
    }),

  /** Ask every connected agent in the organisation to update itself.
   *
   *  Answers with counts rather than waiting: each machine downloads and
   *  installs on its own, and offline machines are reported rather than
   *  treated as failures. */
  upgradeAgents: async (token: string): Promise<FleetUpgradeResult> =>
    apiRequest<FleetUpgradeResult>('/fleet-config/upgrade-agents', {
      token,
      method: 'POST',
    }),
};
