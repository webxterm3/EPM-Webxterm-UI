import { apiRequest } from './api-client';

export interface AccessRequest {
  id: string;
  machine_id: string;
  machine_name: string;
  machine_agent_id: string;
  requester_id: string;
  requester_username: string;
  requester_email: string;
  tenant_id: string;
  owner_id: string;
  owner_email: string;
  /** The one line an approver sees in a queue. The note is the reasoning. */
  title?: string;
  request_note: string;
  /** Hours, on requests stored before durations were counted in minutes.
   *  In that encoding zero meant NEVER EXPIRES. */
  duration_hours?: number;
  /** Minutes. The product offers fifteen-minute windows, which hours could
   *  not express — they rounded to zero, and zero meant permanent. */
  duration_minutes?: number;
  /** What is being asked for: remote support, administrator rights, or
   *  permission to install one piece of software. */
  access_type?: 'remote_support' | 'admin_access' | 'application_installation';
  /** How much control, on requests stored before `asks` existed. */
  access_level?: 'view_only' | 'full_control';

  /** Everything this request asks for. More than one is normal: diagnosing a
   *  crash often needs to watch the screen AND install a debugger, and making
   *  that two requests means two approvals and two windows to line up. */
  asks?: {
    remote_support?: { reason?: string; control?: 'view_only' | 'full_control' };
    admin_access?: { reason?: string };
    app_install?: { reason?: string; applications?: string[] };
  };

  /** The window the session may run in. Both absent means "once approved,
   *  for the duration asked for". */
  not_before?: string;
  not_after?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  approved_by?: string;
  approved_at?: string;
  expires_at?: string;
  rejected_by?: string;
  reject_comment?: string;
  revoked_by?: string;
  revoked_at?: string;
  requested_at: string;
  updated_at: string;
}

export interface AccessRequestListResponse {
  requests: AccessRequest[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export const accessRequestsAPI = {
  async create(
    token: string,
    input: {
      machineId: string;
      title: string;
      durationMinutes: number;
      requestNote: string;
      asks: NonNullable<AccessRequest['asks']>;
      /** RFC3339. Omit both for "as soon as it is approved". */
      notBefore?: string;
      notAfter?: string;
    },
  ): Promise<AccessRequest> {
    return apiRequest<AccessRequest>('/access-requests', {
      method: 'POST',
      body: JSON.stringify({
        machine_id: input.machineId,
        title: input.title,
        duration_minutes: input.durationMinutes,
        request_note: input.requestNote,
        asks: input.asks,
        not_before: input.notBefore ?? '',
        not_after: input.notAfter ?? '',
      }),
      token,
    });
  },

  async getMy(token: string): Promise<{ requests: AccessRequest[]; total: number }> {
    return apiRequest<{ requests: AccessRequest[]; total: number }>('/access-requests/my', {
      method: 'GET',
      token,
    });
  },

  async getMachineRequests(token: string, agentId: string): Promise<{ requests: AccessRequest[]; total: number }> {
    return apiRequest<{ requests: AccessRequest[]; total: number }>(`/machines/${agentId}/access-requests`, {
      method: 'GET',
      token,
    });
  },

  async getPendingCount(token: string, agentId: string): Promise<{ count: number }> {
    return apiRequest<{ count: number }>(`/machines/${agentId}/pending-requests-count`, {
      method: 'GET',
      token,
    });
  },

  async approve(token: string, requestId: string): Promise<{ message: string; request: AccessRequest }> {
    return apiRequest<{ message: string; request: AccessRequest }>(`/access-requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
      token,
    });
  },

  async reject(token: string, requestId: string, comment: string): Promise<{ message: string; request: AccessRequest }> {
    return apiRequest<{ message: string; request: AccessRequest }>(`/access-requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
      token,
    });
  },

  // Admin-only — GET /api/access-requests (list-all across machines, one status tab at a time)
  async list(
    token: string,
    params: { status: AccessRequest['status']; search?: string; page?: number; limit?: number; tenantId?: string },
  ): Promise<AccessRequestListResponse> {
    const query = new URLSearchParams({ status: params.status });
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.tenantId) query.set('tenant_id', params.tenantId);
    return apiRequest<AccessRequestListResponse>(`/access-requests?${query.toString()}`, {
      method: 'GET',
      token,
    });
  },

  // Admin-only — cuts short an active (approved) grant mid-session
  async revoke(token: string, requestId: string): Promise<{ message: string; request: AccessRequest }> {
    return apiRequest<{ message: string; request: AccessRequest }>(`/access-requests/${requestId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({}),
      token,
    });
  },
};

/** The duration a request actually carries, whichever field it was stored in.
 *
 *  Old requests hold hours, where zero meant NEVER EXPIRES. New ones hold
 *  minutes, where a duration is required — so zero there is simply absent. */
export function requestMinutes(r: Pick<AccessRequest, 'duration_minutes' | 'duration_hours'>): number {
  if (r.duration_minutes && r.duration_minutes > 0) return r.duration_minutes;
  return (r.duration_hours ?? 0) * 60;
}

/** Puts a number of minutes into the words somebody reads at a glance.
 *
 *  The old version took HOURS and rendered fifteen minutes as "0h" — which
 *  read as no duration at all, and no duration used to mean permanent. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return 'No expiry';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/** How much control a remote-support session gets. The narrower one is the
 *  default everywhere it is offered. */
export const ACCESS_LEVELS = [
  {
    value: 'view_only' as const,
    label: 'View screen only',
    hint: 'Watch the screen to diagnose. Nothing can be clicked or typed.',
  },
  {
    value: 'full_control' as const,
    label: 'Full control (VNC / RDP)',
    hint: 'Drive the machine as the person sitting at it would.',
  },
];
