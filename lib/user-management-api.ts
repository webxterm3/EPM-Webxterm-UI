import { apiRequest } from './api-client';

// ========== Type Definitions ==========

export interface Organization {
  id: string;
  name: string;
  display_name: string;
  keycloak_realm: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  user_count?: number;
}

export interface Group {
  machine_count: any;
  member_count: any;
  id: string;
  name: string;
  description: string;
  tenant_id: string;
  tenant_name: string;
  keycloak_id: string;
  member_ids: string[];
  machine_ids: string[];
  /** Who decides access requests for this group's machines.
   *
   *  Not the same as membership — members USE the machines, administrators
   *  decide who else may. And not the same as the company_admin role, which is
   *  a property of the account rather than of one group: the point is that the
   *  person who knows whether somebody should reach a finance laptop is not
   *  the one who knows about an engineering one. */
  admin_ids?: string[];
  /** Set when the group came from Microsoft Entra. Its membership is replaced
   *  on every sync, so editing it here would be overwritten. */
  entra_group_id?: string;
  directory_source?: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string; // Portal role: super_admin, company_admin, user
  machine_role: string; // Machine role: allow_sudo, non_sudo
  enabled: boolean;
  email_verified: boolean;
  tenant_id: string;
  tenant_name: string;
  keycloak_id: string;
  created_at: string;
  updated_at?: string;
}

export interface RoleDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  type: 'portal' | 'machine';
  permissions: string[];
}

export interface OrganizationStats {
  organization: Organization;
  stats: {
    total_users: number;
    admin_users: number;
    regular_users: number;
    total_groups: number;
  };
}

// Request types
export interface CreateOrganizationRequest {
  name: string;
  display_name: string;
}

export interface UpdateOrganizationRequest {
  display_name?: string;
  enabled?: boolean;
}

export interface CreateGroupRequest {
  name: string;
  description: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: string;
  machine_role?: string;
}

export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  enabled?: boolean;
}

export interface AssignUserRolesRequest {
  portal_role?: string;
  machine_role?: string;
}

// ========== Organizations API ==========

export const organizationsAPI = {
  async listOrganizations(token: string, opts: { page?: number; limit?: number } = {}): Promise<{ organizations: Organization[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ organizations: Organization[]; total: number; page: number; limit: number; total_pages: number }>(`/admin/organizations${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  async getOrganization(token: string, orgId: string): Promise<Organization> {
    return apiRequest<Organization>(`/admin/organizations/${orgId}`, {
      method: 'GET',
      token,
    });
  },

  async createOrganization(token: string, data: CreateOrganizationRequest): Promise<Organization> {
    return apiRequest<Organization>('/admin/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    });
  },

  async updateOrganization(token: string, orgId: string, data: UpdateOrganizationRequest): Promise<Organization> {
    return apiRequest<Organization>(`/admin/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    });
  },

  async deleteOrganization(token: string, orgId: string): Promise<{ message: string; warning?: string }> {
    return apiRequest<{ message: string; warning?: string }>(`/admin/organizations/${orgId}`, {
      method: 'DELETE',
      token,
    });
  },

  async getOrganizationStats(token: string, orgId: string): Promise<OrganizationStats> {
    return apiRequest<OrganizationStats>(`/admin/organizations/${orgId}/stats`, {
      method: 'GET',
      token,
    });
  },

  async getOrganizationUsers(token: string, orgId: string, opts: { page?: number; limit?: number } = {}): Promise<{ users: User[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ users: User[]; total: number; page: number; limit: number; total_pages: number }>(`/admin/organizations/${orgId}/users${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  async getOrganizationGroups(token: string, orgId: string, opts: { page?: number; limit?: number } = {}): Promise<{ groups: Group[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ groups: Group[]; total: number; page: number; limit: number; total_pages: number }>(`/admin/organizations/${orgId}/groups${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },
};

// ========== Groups API ==========

export const groupsAPI = {
  async listGroups(token: string, opts: { page?: number; limit?: number; search?: string } = {}): Promise<{ groups: Group[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    // Sent to the server, not applied in the browser: the page only holds one
    // page of groups, so filtering here finds nothing on page three.
    if (opts.search?.trim()) params.set('search', opts.search.trim());
    const qs = params.toString();
    return apiRequest<{ groups: Group[]; total: number; page: number; limit: number; total_pages: number }>(`/groups${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  async getGroup(token: string, groupId: string): Promise<Group> {
    return apiRequest<Group>(`/groups/${groupId}`, {
      method: 'GET',
      token,
    });
  },

  async createGroup(token: string, data: CreateGroupRequest): Promise<Group> {
    return apiRequest<Group>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    });
  },

  async updateGroup(token: string, groupId: string, data: UpdateGroupRequest): Promise<Group> {
    return apiRequest<Group>(`/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    });
  },

  async deleteGroup(token: string, groupId: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/groups/${groupId}`, {
      method: 'DELETE',
      token,
    });
  },

  async addMembers(token: string, groupId: string, userIds: string[]): Promise<{ message: string; added_count: number; group: Group }> {
    return apiRequest<{ message: string; added_count: number; group: Group }>(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
      token,
    });
  },

  async removeMember(token: string, groupId: string, userId: string): Promise<{ message: string; group: Group }> {
    return apiRequest<{ message: string; group: Group }>(`/groups/${groupId}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId }),
      token,
    });
  },

  async addMachines(token: string, groupId: string, machineIds: string[]): Promise<{ message: string; added_count: number; total_machines: number; group: Group }> {
    return apiRequest<{ message: string; added_count: number; total_machines: number; group: Group }>(`/groups/${groupId}/machines`, {
      method: 'POST',
      body: JSON.stringify({ machine_ids: machineIds }),
      token,
    });
  },

  async removeMachine(token: string, groupId: string, machineId: string): Promise<{ message: string; group: Group }> {
    return apiRequest<{ message: string; group: Group }>(`/groups/${groupId}/machines/${machineId}`, {
      method: 'DELETE',
      token,
    });
  },

  async getGroupMembers(token: string, groupId: string, opts: { page?: number; limit?: number } = {}): Promise<{ members: User[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ members: User[]; total: number; page: number; limit: number; total_pages: number }>(`/groups/${groupId}/members${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  async getGroupAdmins(token: string, groupId: string): Promise<{ admins: User[]; total: number }> {
    return apiRequest<{ admins: User[]; total: number }>(`/groups/${groupId}/admins`, {
      method: 'GET',
      token,
    });
  },

  async addGroupAdmin(token: string, groupId: string, userId: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/groups/${groupId}/admins`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
      token,
    });
  },

  async removeGroupAdmin(token: string, groupId: string, userId: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/groups/${groupId}/admins/${userId}`, {
      method: 'DELETE',
      token,
    });
  },

  async getGroupMachines(token: string, groupId: string, opts: { page?: number; limit?: number } = {}): Promise<{ machines: Array<{ agent_id: string; name: string; status: string; added_at: string }>; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ machines: Array<{ agent_id: string; name: string; status: string; added_at: string }>; total: number; page: number; limit: number; total_pages: number }>(`/groups/${groupId}/machines${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },
};

// ========== Users API ==========

export const usersAPI = {
  async listUsers(
    token: string,
    tenantId?: string,
    opts: { page?: number; limit?: number; search?: string } = {},
  ): Promise<{ users: User[]; total: number; page: number; limit: number; total_pages: number }> {
    const params = new URLSearchParams();
    if (tenantId && tenantId.trim() !== '') params.set('tenant_id', tenantId);
    if (opts.page !== undefined) params.set('page', String(opts.page));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    // Sent to the server, not applied in the browser: the page only holds one
    // page of users, so filtering here finds nobody who is on page three.
    if (opts.search?.trim()) params.set('search', opts.search.trim());
    const qs = params.toString();
    return apiRequest<{ users: User[]; total: number; page: number; limit: number; total_pages: number }>(`/users${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  async getUser(token: string, userId: string): Promise<User> {
    return apiRequest<User>(`/users/${userId}`, {
      method: 'GET',
      token,
    });
  },

  async createUser(token: string, data: CreateUserRequest): Promise<User> {
    return apiRequest<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    });
  },

  async updateUser(token: string, userId: string, data: UpdateUserRequest): Promise<User> {
    return apiRequest<User>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    });
  },

  async deleteUser(token: string, userId: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/users/${userId}`, {
      method: 'DELETE',
      token,
    });
  },

  async assignRoles(token: string, userId: string, roles: AssignUserRolesRequest): Promise<User> {
    // POST /api/users/:id/roles — the handler is registered on the users
    // group, not under /roles. The old path had an extra prefix and simply
    // 404ed, so assigning a role silently did nothing.
    return apiRequest<User>(`/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify(roles),
      token,
    });
  },

  async getUserGroups(token: string, userId: string): Promise<{ groups: Group[]; total: number }> {
    return apiRequest<{ groups: Group[]; total: number }>(`/users/${userId}/groups`, {
      method: 'GET',
      token,
    });
  },
};

// ========== Roles API ==========

export const rolesAPI = {
  async listAllRoles(token: string): Promise<{ portal_roles: RoleDefinition[]; machine_roles: RoleDefinition[] }> {
    return apiRequest<{ portal_roles: RoleDefinition[]; machine_roles: RoleDefinition[] }>('/roles', {
      method: 'GET',
      token,
    });
  },

  async listPortalRoles(token: string): Promise<{ roles: RoleDefinition[]; total: number }> {
    return apiRequest<{ roles: RoleDefinition[]; total: number }>('/roles/portal', {
      method: 'GET',
      token,
    });
  },

  async listMachineRoles(token: string): Promise<{ roles: RoleDefinition[]; total: number }> {
    return apiRequest<{ roles: RoleDefinition[]; total: number }>('/roles/machine', {
      method: 'GET',
      token,
    });
  },

  async getUserRoles(token: string, userId: string): Promise<{ portal_role: RoleDefinition; machine_role: RoleDefinition }> {
    // GET /api/users/:id/roles — same correction as assignRoles above.
    return apiRequest<{ portal_role: RoleDefinition; machine_role: RoleDefinition }>(`/users/${userId}/roles`, {
      method: 'GET',
      token,
    });
  },
};
