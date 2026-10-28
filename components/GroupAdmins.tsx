'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { User, groupsAPI, usersAPI } from '@/lib/user-management-api';

/** Who decides access requests for this group's machines.
 *
 *  Three different things are easy to confuse on this page:
 *
 *    Members        — people who may USE these machines.
 *    Machines       — the machines themselves.
 *    Administrators — people who decide whether somebody ELSE may.
 *
 *  An administrator here does not have to be a member, and usually should not
 *  be: approving your own group's requests and being in the group are
 *  different jobs. This is also deliberately not the company_admin role — that
 *  is a property of the account, so it approves everything everywhere, which
 *  either becomes a rubber stamp or a bottleneck. */
export default function GroupAdmins({
  groupId,
  tenantId,
  canEdit,
}: {
  groupId: string;
  tenantId?: string;
  canEdit: boolean;
}) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await groupsAPI.getGroupAdmins(token, groupId);
      setAdmins(res.admins ?? []);
    } catch (err) {
      toast({
        title: 'Could not load administrators',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, groupId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (user: User) => {
    if (!token) return;
    try {
      await groupsAPI.removeGroupAdmin(token, groupId, user.id);
      toast({
        title: 'Administrator removed',
        description: `${user.username} no longer decides requests for this group.`,
      });
      load();
    } catch (err) {
      toast({
        title: 'Could not remove the administrator',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  if (loading && admins.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {adding && (
        <AddAdminPanel
          groupId={groupId}
          tenantId={tenantId}
          existing={admins.map(a => a.id)}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {admins.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">This group has no administrators.</p>
            {/* Said plainly, because the consequence is not obvious from an
                empty list: requests still work, they just fall back to whoever
                administers the whole organisation. */}
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Access requests for machines in this group go to whoever administers the
              organisation. Naming someone here sends them to a person who knows these
              machines instead.
            </p>
            {canEdit && (
              <Button className="mt-4 gap-2" size="sm" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" />
                Add Admin
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Access requests for this group&apos;s machines are decided by these people.
            </p>
            {canEdit && !adding && (
              <Button size="sm" onClick={() => setAdding(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Admin
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Account role</th>
                  {canEdit && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map(a => (
                  <tr key={a.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-medium">
                      {[a.first_name, a.last_name].filter(Boolean).join(' ') || a.username}
                      {a.enabled === false && (
                        <Badge variant="outline" className="ml-2 border-red-500/30 bg-red-500/15 text-red-500">
                          Disabled
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.role}</td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(a)}
                          aria-label={`Remove ${a.username}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AddAdminPanel({
  groupId,
  tenantId,
  existing,
  onClose,
  onAdded,
}: {
  groupId: string;
  tenantId?: string;
  existing: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await usersAPI.listUsers(token, tenantId, { limit: 200 });
        if (!cancelled) setUsers(res.users ?? []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load people',
            description: err instanceof Error ? err.message : 'Error',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tenantId, toast]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => !existing.includes(u.id))
      // Only people who can administer anything.
      //
      // Approving an access request is an administrative act, and offering
      // somebody who cannot sign in to the admin side would create an
      // approver who never sees the queue — a request routed to a person for
      // whom the page does not exist.
      .filter(u => u.role === 'company_admin' || u.role === 'super_admin')
      .filter(u => u.enabled !== false)
      .filter(u =>
        q === '' ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [users, existing, search]);

  const add = async (user: User) => {
    if (!token) return;
    setSaving(user.id);
    try {
      await groupsAPI.addGroupAdmin(token, groupId, user.id);
      toast({
        title: 'Administrator added',
        description: `${user.username} now decides access requests for this group.`,
      });
      onAdded();
    } catch (err) {
      toast({
        title: 'Could not add the administrator',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium">Add Admin</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              They do not need to be a member of this group, but they do need an
              administrator account — approving is an administrative act.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email"
        />

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {search.trim()
              ? `No administrator matches "${search.trim()}".`
              : 'Every administrator in this organisation already administers this group. ' +
                'Only people with an administrator account can approve requests.'}
          </p>
        ) : (
          <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {candidates.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving !== null}
                  onClick={() => add(u)}
                  className="gap-1.5"
                >
                  {saving === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
