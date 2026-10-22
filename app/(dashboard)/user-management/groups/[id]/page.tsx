'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupAdmins from '@/components/GroupAdmins';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Users,
  Server,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  UserPlus,
  UserMinus,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { groupsAPI, usersAPI, type Group } from '@/lib/user-management-api';
import { machinesAPI, type Machine } from '@/lib/machines-api';

const ITEMS_PER_PAGE = 10;

export default function GroupDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const groupId = params.id as string;

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [availableMachines, setAvailableMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  // Search states
  const [memberSearch, setMemberSearch] = useState('');
  const [machineSearch, setMachineSearch] = useState('');

  // Pagination states
  const [membersPage, setMembersPage] = useState(1);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersTotalPages, setMembersTotalPages] = useState(1);
  const [machinesPage, setMachinesPage] = useState(1);

  // Dialogs
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [addMachineDialog, setAddMachineDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [adding, setAdding] = useState(false);

  // Check if user is admin
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin';

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

  const loadMembers = async (page: number) => {
    if (!token || !groupId) return;
    try {
      const data = await groupsAPI.getGroupMembers(token, groupId, { page, limit: ITEMS_PER_PAGE });
      setMembers(data.members || []);
      setMembersTotal(data.total ?? 0);
      setMembersTotalPages(data.total_pages ?? 1);
      setMembersPage(page);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load members', variant: 'destructive' });
    }
  };

  const fetchGroupDetails = async () => {
    if (!token || !groupId) return;

    setLoading(true);
    try {
      // Fetch group details
      const groupData = await groupsAPI.getGroup(token, groupId);
      setGroup(groupData);

      // Fetch members (page 1)
      const membersData = await groupsAPI.getGroupMembers(token, groupId, { page: 1, limit: ITEMS_PER_PAGE });
      setMembers(membersData.members || []);
      setMembersTotal(membersData.total ?? 0);
      setMembersTotalPages(membersData.total_pages ?? 1);
      setMembersPage(1);

      // Fetch all machines first to get full details
      const allMachinesData = await machinesAPI.listMachines(token);
      const allMachines = allMachinesData.machines || [];

      // Fetch group machines (which only have agent_ids)
      const machinesData = await groupsAPI.getGroupMachines(token, groupId);
      const machineIds = machinesData.machines?.map((m: any) => m.agent_id) || [];

      // Merge: get full machine details for machines in this group
      const groupMachinesWithDetails = Array.isArray(allMachines)
        ? allMachines.filter((m: Machine) => machineIds.includes(m.agent_id))
        : [];
      setMachines(groupMachinesWithDetails);

      // Fetch available users (all users not in group)
      const allUsers = await usersAPI.listUsers(token, user?.tenant_id);
      const memberIds = membersData.members?.map((m: any) => m.id) || [];
      // Members only — administrators are offered on the Admins tab instead.
      //
      // The two lists answer different questions and were the same list:
      // members USE these machines, administrators decide who else may. One
      // picker offering both made it easy to add somebody as a member when
      // the intention was to make them an approver, which looks identical on
      // this page and behaves nothing like it.
      const available = allUsers.users.filter(
        (u: any) =>
          !memberIds.includes(u.id) &&
          u.role !== 'company_admin' &&
          u.role !== 'super_admin',
      );
      setAvailableUsers(available);

      // Fetch available machines (machines not in this group)
      const availMachines = Array.isArray(allMachines)
        ? allMachines.filter((m: Machine) => !machineIds.includes(m.agent_id))
        : [];
      setAvailableMachines(availMachines);

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load group details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [token, groupId]);

  // Add member to group
  const handleAddMember = async () => {
    if (!token || !selectedUser) return;

    setAdding(true);
    try {
      await groupsAPI.addMembers(token, groupId, [selectedUser]);
      toast({
        title: 'Success',
        description: 'User added to group successfully',
      });
      setAddMemberDialog(false);
      setSelectedUser('');
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add user to group',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  // Remove member from group
  const handleRemoveMember = async (userId: string) => {
    if (!token) return;

    try {
      await groupsAPI.removeMember(token, groupId, userId);
      toast({
        title: 'Success',
        description: 'User removed from group successfully',
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove user from group',
        variant: 'destructive',
      });
    }
  };

  // Add machine to group
  const handleAddMachine = async () => {
    if (!token || !selectedMachine) return;

    setAdding(true);
    try {
      await groupsAPI.addMachines(token, groupId, [selectedMachine]);
      toast({
        title: 'Success',
        description: 'Machine added to group successfully',
      });
      setAddMachineDialog(false);
      setSelectedMachine('');
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add machine to group',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  // Remove machine from group
  const handleRemoveMachine = async (machineId: string) => {
    if (!token) return;

    try {
      await groupsAPI.removeMachine(token, groupId, machineId);
      toast({
        title: 'Success',
        description: 'Machine removed from group successfully',
      });
      fetchGroupDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove machine from group',
        variant: 'destructive',
      });
    }
  };

  // Filtered data
  const filteredMembers = useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return members.filter((member: any) =>
      member.username?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      member.email?.toLowerCase().includes(memberSearch.toLowerCase())
    );
  }, [members, memberSearch]);

  const filteredMachines = useMemo(() => {
    if (!machines || !Array.isArray(machines)) return [];
    return machines.filter((machine: any) =>
      machine.name?.toLowerCase().includes(machineSearch.toLowerCase())
    );
  }, [machines, machineSearch]);

  // Paginated data
  const paginatedMachines = useMemo(() => {
    const start = (machinesPage - 1) * ITEMS_PER_PAGE;
    return filteredMachines.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMachines, machinesPage]);

  // Total pages
  const machinesTotalPages = Math.ceil(filteredMachines.length / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Group Not Found</h1>
          <p className="text-muted-foreground mb-4">The group you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/user-management')}>
            Back to Organisation Management
          </Button>
        </div>
      </div>
    );
  }

  const PaginationControls = ({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Organisation Management', href: '/user-management' },
          { label: 'Groups', href: '/user-management?tab=groups' },
          { label: group.name }
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push('/user-management?tab=groups')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-muted-foreground">
            {group.description || 'No description'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Group Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">
              Users with access to group machines
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Machines</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{machines.length}</div>
            <p className="text-xs text-muted-foreground">
              {machines.filter((m: any) => m.status === 'online').length} online
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Group Info */}
      <Card className="glass-card mb-6">
        <CardHeader>
          <CardTitle>Group Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Group Name</p>
              <p className="font-medium">{group.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Organization</p>
              <p className="font-medium">{group.tenant_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Created</p>
              <p className="font-medium">
                {new Date(group.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p className="font-medium">{group.description || 'No description'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Members and Machines */}
      <Card className="glass-card">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <TabsList className="grid grid-cols-3 w-[560px]">
                <TabsTrigger value="members" className="gap-2">
                  <Users className="w-4 h-4" />
                  Members ({filteredMembers.length})
                </TabsTrigger>
                <TabsTrigger value="machines" className="gap-2">
                  <Server className="w-4 h-4" />
                  Machines ({filteredMachines.length})
                </TabsTrigger>
                {/* Who decides access requests for the machines on the tab
                    beside this one. Members use them; administrators say who
                    else may. */}
                <TabsTrigger value="admins" className="gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Admins
                </TabsTrigger>
              </TabsList>
              <div>
                {activeTab === 'members' && (
                  <Button onClick={() => setAddMemberDialog(true)} size="sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                )}
                {activeTab === 'machines' && (
                  <Button onClick={() => setAddMachineDialog(true)} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Machine
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Administrators Tab */}
            <TabsContent value="admins" className="mt-0">
              <GroupAdmins
                groupId={groupId}
                tenantId={group?.tenant_id}
                canEdit={isAdmin}
              />
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-0">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      setMembersPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>

              {filteredMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No members found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Machine Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member: any) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.username}</TableCell>
                          <TableCell>{member.email}</TableCell>
                          <TableCell>
                            <Badge variant={member.role === 'super_admin' ? 'default' : 'secondary'}>
                              {member.role.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.machine_role === 'allow_sudo' ? 'default' : 'outline'}>
                              {member.machine_role?.replace('_', ' ') || 'non_sudo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <PaginationControls
                    currentPage={membersPage}
                    totalPages={membersTotalPages}
                    onPageChange={loadMembers}
                  />
                </>
              )}
            </TabsContent>

            {/* Machines Tab */}
            <TabsContent value="machines" className="mt-0">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search machines..."
                    value={machineSearch}
                    onChange={(e) => {
                      setMachineSearch(e.target.value);
                      setMachinesPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>

              {paginatedMachines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No machines found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedMachines.map((machine: any, index: number) => (
                        <TableRow key={machine.id || machine.agent_id || `machine-${index}`}>
                          <TableCell className="font-medium">{machine.name}</TableCell>
                          <TableCell>
                            <Badge variant={machine.status === 'online' ? 'default' : 'secondary'}>
                              {machine.status === 'online' ? (
                                <CheckCircle className="w-3 h-3 mr-1" />
                              ) : (
                                <XCircle className="w-3 h-3 mr-1" />
                              )}
                              {machine.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {machine.added_at ? new Date(machine.added_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMachine(machine.agent_id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <PaginationControls
                    currentPage={machinesPage}
                    totalPages={machinesTotalPages}
                    onPageChange={setMachinesPage}
                  />
                </>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member to Group</DialogTitle>
            <DialogDescription>
              Select a user to add to this group. They will get access to all machines in the group.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Select User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    Everybody who is not an administrator is already a member.
                    Administrators are added on the Admins tab.
                  </div>
                ) : (
                  availableUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username} ({user.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={!selectedUser || adding}>
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Machine Dialog */}
      <Dialog open={addMachineDialog} onOpenChange={setAddMachineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Machine to Group</DialogTitle>
            <DialogDescription>
              Select a machine to add to this group. All group members will get access to it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Select Machine</Label>
            <Select value={selectedMachine} onValueChange={setSelectedMachine}>
              <SelectTrigger>
                <SelectValue placeholder="Select a machine" />
              </SelectTrigger>
              <SelectContent>
                {availableMachines.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No available machines
                  </div>
                ) : (
                  availableMachines.map((machine: Machine) => (
                    <SelectItem key={machine.agent_id} value={machine.agent_id}>
                      {machine.name} - {machine.status}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMachineDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMachine} disabled={!selectedMachine || adding}>
              {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Machine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
