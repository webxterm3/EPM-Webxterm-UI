'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Users as UsersIcon,
  Shield,
  UserCog,
  Plus,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Eye,
  Server,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  organizationsAPI,
  groupsAPI,
  usersAPI,
  rolesAPI,
  type Organization,
  type Group,
  type User as UserType,
  type RoleDefinition
} from '@/lib/user-management-api';
import { signupDisabled } from '@/lib/features';

export default function UserManagementPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // Check user role
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin';

  // Redirect if not admin
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const PAGE_SIZE = 10;

  // Set default tab based on role
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'organizations' : 'groups');

  // Pagination state
  const [orgsPage, setOrgsPage] = useState(1);
  const [orgsTotal, setOrgsTotal] = useState(0);
  const [orgsTotalPages, setOrgsTotalPages] = useState(1);
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [groupsTotalPages, setGroupsTotalPages] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  // Organizations State
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [createOrgDialog, setCreateOrgDialog] = useState(false);
  const [deleteOrgDialog, setDeleteOrgDialog] = useState<string | null>(null);
  const [newOrg, setNewOrg] = useState({ name: '', display_name: '' });
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Groups State
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [createGroupDialog, setCreateGroupDialog] = useState(false);
  const [deleteGroupDialog, setDeleteGroupDialog] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserType[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'user',
    machine_role: 'non_sudo'
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteUserDialog, setDeleteUserDialog] = useState<string | null>(null);
  const [assignRoleDialog, setAssignRoleDialog] = useState<UserType | null>(null);
  const [selectedPortalRole, setSelectedPortalRole] = useState('');
  const [selectedMachineRole, setSelectedMachineRole] = useState('');
  const [assigningRole, setAssigningRole] = useState(false);

  // Roles State
  const [portalRoles, setPortalRoles] = useState<RoleDefinition[]>([]);
  const [machineRoles, setMachineRoles] = useState<RoleDefinition[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Fetch Organizations
  const fetchOrganizations = async (page = 1) => {
    if (!token || !isSuperAdmin) return;
    setOrgsLoading(true);
    try {
      const data = await organizationsAPI.listOrganizations(token, { page, limit: PAGE_SIZE });
      setOrganizations(data.organizations || []);
      setOrgsTotal(data.total ?? 0);
      setOrgsTotalPages(data.total_pages ?? 1);
      setOrgsPage(page);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load organizations',
        variant: 'destructive',
      });
    } finally {
      setOrgsLoading(false);
    }
  };

  // Fetch Groups
  const fetchGroups = async (page = 1) => {
    if (!token) return;
    setGroupsLoading(true);
    try {
      const data = await groupsAPI.listGroups(token, {
        page,
        limit: PAGE_SIZE,
        // Searched server-side. Filtering the fetched page in the browser only
        // ever searched the ten groups already on screen, so anything on a
        // later page was unfindable.
        search: groupSearch,
      });
      setGroups(data.groups || []);
      setGroupsTotal(data.total ?? 0);
      setGroupsTotalPages(data.total_pages ?? 1);
      setGroupsPage(page);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load groups',
        variant: 'destructive',
      });
    } finally {
      setGroupsLoading(false);
    }
  };

  // Fetch Users
  const fetchUsers = async (page = 1) => {
    if (!token) return;
    setUsersLoading(true);
    try {
      const tenantId = user?.tenant_id;

      if (isSuperAdmin && (!tenantId || tenantId.trim() === '')) {
        toast({
          title: 'Error',
          description: 'Cannot load users: Tenant ID not found in user profile. Please log out and log in again.',
          variant: 'destructive',
        });
        setUsersLoading(false);
        return;
      }

      const data = await usersAPI.listUsers(token, tenantId, {
        page,
        limit: PAGE_SIZE,
        // Searched server-side. Filtering the fetched page in the browser only
        // ever searched the ten users already on screen, so anybody on a later
        // page was unfindable.
        search: userSearch,
      });
      setUsers(data.users || []);
      setUsersTotal(data.total ?? 0);
      setUsersTotalPages(data.total_pages ?? 1);
      setUsersPage(page);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setUsersLoading(false);
    }
  };

  // Fetch Roles
  const fetchRoles = async () => {
    if (!token) return;
    setRolesLoading(true);
    try {
      const portalData = await rolesAPI.listPortalRoles(token);
      const machineData = await rolesAPI.listMachineRoles(token);
      setPortalRoles(portalData.roles || []);
      setMachineRoles(machineData.roles || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load roles',
        variant: 'destructive',
      });
    } finally {
      setRolesLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (isSuperAdmin && activeTab === 'organizations') {
      fetchOrganizations();
    }
  }, [activeTab, isSuperAdmin, token]);

  useEffect(() => {
    if (activeTab !== 'groups') return;

    // Debounced so typing does not fire a request per keystroke, and reset to
    // page 1 — staying on page 4 of a narrower result set shows an empty
    // table for no visible reason.
    const t = setTimeout(() => fetchGroups(1), groupSearch ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, groupSearch]);

  useEffect(() => {
    if (activeTab !== 'users') return;

    // Debounced so typing does not fire a request per keystroke, and reset to
    // page 1 — staying on page 4 of a narrower result set shows an empty
    // table for no visible reason.
    const t = setTimeout(() => fetchUsers(1), userSearch ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, userSearch]);

  useEffect(() => {
    if (activeTab === 'roles') {
      fetchRoles();
    }
  }, [activeTab, token]);

  // Create Organization
  const handleCreateOrganization = async () => {
    if (!token || !newOrg.name || !newOrg.display_name) {
      toast({
        title: 'Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      });
      return;
    }

    setCreatingOrg(true);
    try {
      await organizationsAPI.createOrganization(token, newOrg);
      toast({
        title: 'Success',
        description: 'Organization created successfully',
      });
      setCreateOrgDialog(false);
      setNewOrg({ name: '', display_name: '' });
      fetchOrganizations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create organization',
        variant: 'destructive',
      });
    } finally {
      setCreatingOrg(false);
    }
  };

  // Delete Organization
  const handleDeleteOrganization = async (orgId: string) => {
    if (!token) return;

    try {
      await organizationsAPI.deleteOrganization(token, orgId);
      toast({
        title: 'Success',
        description: 'Organization deleted successfully',
      });
      setDeleteOrgDialog(null);
      fetchOrganizations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete organization',
        variant: 'destructive',
      });
    }
  };

  // Create Group
  const handleCreateGroup = async () => {
    if (!token || !newGroup.name) {
      toast({
        title: 'Error',
        description: 'Please provide a group name',
        variant: 'destructive',
      });
      return;
    }

    setCreatingGroup(true);
    try {
      await groupsAPI.createGroup(token, newGroup);
      toast({
        title: 'Success',
        description: 'Group created successfully',
      });
      setCreateGroupDialog(false);
      setNewGroup({ name: '', description: '' });
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create group',
        variant: 'destructive',
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (groupId: string) => {
    if (!token) return;

    try {
      await groupsAPI.deleteGroup(token, groupId);
      toast({
        title: 'Success',
        description: 'Group deleted successfully',
      });
      setDeleteGroupDialog(null);
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete group',
        variant: 'destructive',
      });
    }
  };

  // Create User
  const handleCreateUser = async () => {
    if (!token || !newUser.username || !newUser.email || !newUser.password) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    setCreatingUser(true);
    try {
      await usersAPI.createUser(token, newUser);
      toast({
        title: 'Success',
        description: 'User created successfully',
      });
      setCreateUserDialog(false);
      setNewUser({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'user',
        machine_role: 'non_sudo'
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  // Assign Role to User
  const handleAssignRole = async () => {
    if (!token || !assignRoleDialog) return;

    setAssigningRole(true);
    try {
      await usersAPI.assignRoles(token, assignRoleDialog.id, {
        portal_role: selectedPortalRole || assignRoleDialog.role,
        machine_role: selectedMachineRole || assignRoleDialog.machine_role,
      });
      toast({
        title: 'Success',
        description: 'User roles updated successfully',
      });
      setAssignRoleDialog(null);
      setSelectedPortalRole('');
      setSelectedMachineRole('');
      // Reload the page the admin is actually on; jumping back to page 1
      // after every role change loses their place in a long list.
      fetchUsers(usersPage);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign roles',
        variant: 'destructive',
      });
    } finally {
      setAssigningRole(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (userId: string) => {
    if (!token) return;

    try {
      await usersAPI.deleteUser(token, userId);
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      setDeleteUserDialog(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  // Filter data
  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
    org.display_name.toLowerCase().includes(orgSearch.toLowerCase())
  );

  // No client-side filtering: the server returned exactly the matches for the
  // current search, across the whole tenant rather than the current page.
  const filteredGroups = groups;

  // No client-side filtering: the server returned exactly the matches for the
  // current search, across the whole tenant rather than the current page.
  const filteredUsers = users;

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[{ label: 'Organisation Management' }]}
        className="mb-6"
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Organisation Management</h1>
          <p className="text-muted-foreground">
            Manage organizations, groups, users, and roles
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          {isSuperAdmin && (
            <TabsTrigger value="organizations" className="gap-2">
              <Building2 className="w-4 h-4" />
              Organizations
            </TabsTrigger>
          )}
          <TabsTrigger value="groups" className="gap-2">
            <UsersIcon className="w-4 h-4" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="w-4 h-4" />
            Roles
          </TabsTrigger>
        </TabsList>

        {/* Organizations Tab */}
        {isSuperAdmin && (
          <TabsContent value="organizations">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      Organizations
                    </CardTitle>
                    <CardDescription>
                      Manage organizations in the system
                    </CardDescription>
                  </div>
                  {/* Commented out already, and now also behind the flag —
                      so whoever uncomments it does not quietly reopen
                      tenant creation on an installation that switched it
                      off at the signup form. */}
                  {!signupDisabled && false && (
                    <Button onClick={() => setCreateOrgDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Organization
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search organizations..."
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Table */}
                {orgsLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Realm</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrgs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No organizations found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrgs.map((org) => (
                          <TableRow key={org.id}>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell>{org.display_name}</TableCell>
                            <TableCell>
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {org.keycloak_realm}
                              </code>
                            </TableCell>
                            <TableCell>
                              {org.enabled ? (
                                <Badge variant="default" className="gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <XCircle className="w-3 h-3" />
                                  Disabled
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {new Date(org.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => router.push(`/user-management/organizations/${org.id}`)}>
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => setDeleteOrgDialog(org.id)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {orgsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {orgsPage} of {orgsTotalPages} ({orgsTotal} total)
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => fetchOrganizations(orgsPage - 1)} disabled={orgsPage === 1}>
                          <ChevronLeft className="w-4 h-4" />Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => fetchOrganizations(orgsPage + 1)} disabled={orgsPage === orgsTotalPages}>
                          Next<ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Groups Tab */}
        <TabsContent value="groups">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-primary" />
                    Groups
                  </CardTitle>
                  <CardDescription>
                    Manage groups and assign users to machines
                  </CardDescription>
                </div>
                <Button onClick={() => setCreateGroupDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Group
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search groups..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Table */}
              {groupsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Machines</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No groups found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredGroups.map((group) => (
                        <TableRow key={group.id}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell>{group.description || '-'}</TableCell>
                          <TableCell>{group.tenant_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {group.member_ids?.length || 0} users
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {group.machine_ids?.length || 0} machines
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(group.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push(`/user-management/groups/${group.id}`)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => setDeleteGroupDialog(group.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="mt-4">
                  <PaginationBar
                    page={groupsPage}
                    totalPages={groupsTotalPages}
                    total={groupsTotal}
                    onPageChange={fetchGroups}
                    label="groups"
                  />
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-primary" />
                    Users
                  </CardTitle>
                  <CardDescription>
                    View and manage users in your organization
                  </CardDescription>
                </div>
                <Button onClick={() => setCreateUserDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Table */}
              {usersLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Portal Role</TableHead>
                      <TableHead>Machine Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.username}</TableCell>
                          <TableCell>{`${user.first_name} ${user.last_name}`}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === 'super_admin' ? 'default' : 'secondary'}>
                              {user.role.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.machine_role === 'allow_sudo' ? 'default' : 'outline'}>
                              {user.machine_role.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.enabled ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <XCircle className="w-3 h-3" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setAssignRoleDialog(user);
                                    setSelectedPortalRole(user.role);
                                    setSelectedMachineRole(user.machine_role);
                                  }}
                                >
                                  <Shield className="w-4 h-4 mr-2" />
                                  Assign Roles
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => setDeleteUserDialog(user.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="mt-4">
                  <PaginationBar
                    page={usersPage}
                    totalPages={usersTotalPages}
                    total={usersTotal}
                    onPageChange={fetchUsers}
                    label="users"
                  />
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Portal Roles */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Portal Roles
                </CardTitle>
                <CardDescription>
                  Roles that control access to the web portal
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {portalRoles.map((role) => (
                      <div key={role.id} className="p-4 rounded-lg border border-border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{role.display_name}</h3>
                          <Badge variant={role.name === 'super_admin' ? 'default' : 'secondary'}>
                            {role.name}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {role.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {role.permissions.map((perm, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Machine Roles */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Machine Roles
                </CardTitle>
                <CardDescription>
                  Roles that control access level on machines
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {machineRoles.map((role) => (
                      <div key={role.id} className="p-4 rounded-lg border border-border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{role.display_name}</h3>
                          <Badge variant={role.name === 'allow_sudo' ? 'default' : 'outline'}>
                            {role.name}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {role.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {role.permissions.map((perm, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Organization Dialog */}
      <Dialog open={createOrgDialog} onOpenChange={setCreateOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to group users and resources
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="my-company"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="org-display">Display Name</Label>
              <Input
                id="org-display"
                placeholder="My Company"
                value={newOrg.display_name}
                onChange={(e) => setNewOrg({ ...newOrg, display_name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOrgDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrganization} disabled={creatingOrg}>
              {creatingOrg && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={!!deleteOrgDialog} onOpenChange={() => setDeleteOrgDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this organization? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrgDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteOrgDialog && handleDeleteOrganization(deleteOrgDialog)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialog} onOpenChange={setCreateGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
            <DialogDescription>
              Create a group to manage user access to machines
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="developers"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="group-desc">Description</Label>
              <Input
                id="group-desc"
                placeholder="Development team"
                value={newGroup.description}
                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={creatingGroup}>
              {creatingGroup && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog */}
      <Dialog open={!!deleteGroupDialog} onOpenChange={() => setDeleteGroupDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this group? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteGroupDialog && handleDeleteGroup(deleteGroupDialog)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user in your organization
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  placeholder="johndoe"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  placeholder="John"
                  value={newUser.first_name}
                  onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  placeholder="Doe"
                  value={newUser.last_name}
                  onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Portal Role</Label>
                <Select value={newUser.role} onValueChange={(val) => setNewUser({ ...newUser, role: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select portal role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="company_admin">Company Admin</SelectItem>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {/* Machine Role is hidden from the form but still sent: the
                  backend and the API contract keep it, and newUser already
                  carries the "non_sudo" default. Dropping it from the payload
                  would change behaviour rather than just the UI. */}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog open={!!assignRoleDialog} onOpenChange={() => setAssignRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Roles</DialogTitle>
            <DialogDescription>
              Assign portal and machine roles to {assignRoleDialog?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Portal Role</Label>
              <Select value={selectedPortalRole} onValueChange={setSelectedPortalRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select portal role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="company_admin">Company Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Machine Role is hidden here too. selectedMachineRole is still
                populated from the user's current value when the dialog opens,
                so assigning a portal role leaves it untouched rather than
                silently resetting it. */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRoleDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssignRole} disabled={assigningRole}>
              {assigningRole && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteUserDialog} onOpenChange={() => setDeleteUserDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserDialog && handleDeleteUser(deleteUserDialog)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
