'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  ShieldAlert,
  AlertTriangle,
  Trash2,
  KeyRound,
  Users,
  Ban,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ScopePicker } from '@/components/PolicyEditor';
import { describeScope } from '@/lib/policy-scope';
import {
  privilegePoliciesAPI,
  newPrivilegePolicy,
  PrivilegePolicy,
  PrivilegeSimulation,
} from '@/lib/privilege-policies-api';

/** Least-privilege policies: who may hold local administrator rights.
 *
 *  The most consequential screen in the product. Everything on it is arranged
 *  so that the dangerous thing takes more steps than the safe one: a new
 *  policy starts disabled, in audit mode, demoting nobody; the organisation's
 *  enforcement switch is separate and sits at the top; and the simulation runs
 *  before saving rather than after.
 */
export default function PrivilegePolicies() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [policies, setPolicies] = useState<PrivilegePolicy[]>([]);
  const [enforcement, setEnforcementState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [editing, setEditing] = useState<Partial<PrivilegePolicy> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await privilegePoliciesAPI.list(token);
      setPolicies(res.policies ?? []);
      setEnforcementState(res.enforcement_enabled ?? false);
    } catch (err) {
      toast({
        title: 'Could not load privilege policies',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setEnforcement = useCallback(
    async (next: boolean) => {
      if (!token) return;
      setSavingSwitch(true);
      try {
        await privilegePoliciesAPI.setEnforcement(token, next);
        setEnforcementState(next);
        toast({
          title: next ? 'Least privilege is now enforced' : 'Least privilege is no longer enforced',
          description: next
            ? 'Policies in enforce mode will now remove administrator rights on the machines they reach.'
            : 'Administrator rights removed by this product are being restored on every machine.',
        });
      } catch (err) {
        toast({
          title: 'Could not change the setting',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setSavingSwitch(false);
      }
    },
    [token, toast],
  );

  const remove = useCallback(
    async (policy: PrivilegePolicy) => {
      if (!token) return;
      try {
        await privilegePoliciesAPI.remove(token, policy.id);
        // Deleting a policy that was demoting people GIVES THE RIGHTS BACK:
        // the next push carries no instruction and every endpoint reverses
        // what it applied. Said out loud because the opposite is what people
        // expect from a delete.
        toast({
          title: 'Policy deleted',
          description: 'Any administrator rights it removed are being restored on every machine.',
        });
        load();
      } catch (err) {
        toast({
          title: 'Could not delete the policy',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [token, toast, load],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading privilege policies…
      </div>
    );
  }

  if (editing) {
    return (
      <PrivilegePolicyEditor
        policy={editing}
        enforcementEnabled={enforcement}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Who may hold local administrator rights. An administrator can undo anything this product
          enforces on their machine, so this is the control the rest depends on.
        </p>
        <Button onClick={() => setEditing(newPrivilegePolicy())} className="gap-2">
          <Plus className="h-4 w-4" />
          New policy
        </Button>
      </div>

      <PrivilegeEnforcementSwitch
        enabled={enforcement}
        saving={savingSwitch}
        onChange={setEnforcement}
      />

      {policies.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No privilege policies yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start with one in audit mode. It will show you who holds administrator rights across the
            fleet and what removing them would do, without changing anything.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map(p => (
            <PolicyCard
              key={p.id}
              policy={p}
              enforcementEnabled={enforcement}
              onEdit={() => setEditing(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The organisation-wide switch.
 *
 *  Its own card above the list, like application control's, because whether
 *  any of this acts on somebody's machine is one decision for the whole
 *  organisation rather than a property of each policy.
 */
function PrivilegeEnforcementSwitch({
  enabled,
  saving,
  onChange,
}: {
  enabled: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        enabled ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60 bg-muted/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={cn('h-4 w-4', enabled ? 'text-amber-500' : 'text-muted-foreground')}
            />
            <h3 className="font-medium">Least privilege enforcement</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {enabled ? (
              <>
                Policies in enforce mode are removing administrator rights on the machines they
                reach. Turning this off restores every right this product removed.
              </>
            ) : (
              <>
                Policies are evaluated and reported, and nothing is removed from anybody. A policy
                saved as &ldquo;enforce&rdquo; does nothing at all while this is off.
              </>
            )}
          </p>
          {/* Separate from the application-control switch, and said so.
              Somebody who turned that one on has not turned this one on, and
              a screen that let them assume otherwise would be describing a
              fleet they do not have. */}
          <p className="mt-2 text-xs text-muted-foreground">
            This is separate from application control&rsquo;s enforcement switch. Turning that one
            on does not remove anybody&rsquo;s administrator rights.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={next => {
              // Confirm on the way ON only. Turning it off restores rights,
              // which is the safe direction and should never be slowed down.
              if (next) setConfirming(true);
              else onChange(false);
            }}
          />
        </div>
      </div>

      {confirming && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-background p-4">
          <p className="text-sm font-medium">
            This will remove administrator rights from people on their own machines.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>• Only policies saved in enforce mode, on the machines they reach.</li>
            <li>• No machine is left without an administrator — those are refused and reported.</li>
            <li>• Turning this off again restores every right that was removed.</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setConfirming(false);
                onChange(true);
              }}
            >
              Turn on enforcement
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyCard({
  policy,
  enforcementEnabled,
  onEdit,
  onDelete,
}: {
  policy: PrivilegePolicy;
  enforcementEnabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const live = policy.enabled && policy.mode === 'enforce' && policy.demote_admins;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{policy.name}</span>
            {!policy.enabled && (
              <Badge variant="outline" className="text-[10px]">
                disabled
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                policy.mode === 'enforce' && 'border-amber-500/50 text-amber-500',
              )}
            >
              {policy.mode}
            </Badge>
            {policy.demote_admins ? (
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-[10px] text-amber-500">
                <Ban className="h-2.5 w-2.5" />
                removes admin rights
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                reports only
              </Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">{describeScope(policy)}</p>

          {policy.keep_admin && policy.keep_admin.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Exempt: {policy.keep_admin.join(', ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ReachWarning policy={policy} />

      {live && !enforcementEnabled && (
        <p className="mt-3 text-xs text-muted-foreground">
          This policy is set to enforce, but the organisation&rsquo;s enforcement switch is off, so
          it is not removing anybody&rsquo;s rights.
        </p>
      )}
    </div>
  );
}

/** Says when a policy reaches no machine at all.
 *
 *  The failure this exists to surface: a machine was re-enrolled, got a new
 *  agent id, and the policy naming the old one goes on looking enabled and
 *  enforcing while applying to nothing. That has already happened once in
 *  this product with application policies.
 */
function ReachWarning({ policy }: { policy: PrivilegePolicy }) {
  // Absent is not zero. Absent means the count was not computed, which is a
  // database hiccup, not a finding.
  if (policy.machines_in_scope === undefined || policy.machines_in_scope > 0) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">This policy reaches no machine.</span> It names a machine or
        group that is no longer enrolled — re-enrolling gives a machine a new identity, and the
        policy still names the old one. Edit the scope and pick the machine again.
      </span>
    </div>
  );
}

/** The editor, with the simulation built into it. */
function PrivilegePolicyEditor({
  policy,
  enforcementEnabled,
  onCancel,
  onSaved,
}: {
  policy: Partial<PrivilegePolicy>;
  enforcementEnabled: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [draft, setDraft] = useState<Partial<PrivilegePolicy>>(policy);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<PrivilegeSimulation | null>(null);

  const set = <K extends keyof PrivilegePolicy>(key: K, value: PrivilegePolicy[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const simulate = useCallback(async () => {
    if (!token) return;
    setSimulating(true);
    try {
      const res = await privilegePoliciesAPI.simulate(token, draft);
      setSimulation(res.simulation);
    } catch (err) {
      toast({
        title: 'Could not simulate',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSimulating(false);
    }
  }, [token, draft, toast]);

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (draft.id) await privilegePoliciesAPI.update(token, draft.id, draft);
      else await privilegePoliciesAPI.create(token, draft);
      toast({ title: 'Policy saved' });
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not save the policy',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [token, draft, toast, onSaved]);

  const keepAdminText = (draft.keep_admin ?? []).join('\n');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">
          {draft.id ? 'Edit privilege policy' : 'New privilege policy'}
        </h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pp-name">Name</Label>
        <Input
          id="pp-name"
          value={draft.name ?? ''}
          onChange={e => set('name', e.target.value)}
          placeholder="Remove local admin from laptops"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pp-desc">Description</Label>
        <Textarea
          id="pp-desc"
          value={draft.description ?? ''}
          onChange={e => set('description', e.target.value)}
          rows={2}
        />
      </div>

      {/* The instruction, on its own, stated plainly. Not folded in with the
          mode select: "does this remove rights" and "is this live" are two
          separate questions and conflating them is how somebody enforces
          something they only meant to measure. */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-base">Remove local administrator rights</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Takes administrator rights from the accounts that hold them on machines in scope.
              Leave this off for a policy that only reports who has them.
            </p>
          </div>
          <Switch
            checked={draft.demote_admins ?? false}
            onCheckedChange={v => set('demote_admins', v)}
          />
        </div>

        {draft.demote_admins && (
          // The consequence nobody connects to the cause. On macOS the admin
          // group is in sudoers via %admin, so losing admin loses sudo with
          // it — a second change they did not ask for, which bites a week
          // later with nothing to connect it to.
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">This also removes their sudo access.</span> On macOS the
            administrators group is in sudoers, so anybody demoted loses <code>sudo</code> as well.
            Add the commands they still need under Elevation below, or they will find out the hard
            way.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>What this policy does</Label>
        <div className="flex gap-2">
          {(['audit', 'enforce'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => set('mode', mode)}
              className={cn(
                'flex-1 rounded-lg border p-3 text-left text-sm',
                draft.mode === mode ? 'border-primary bg-primary/5' : 'border-border/60',
              )}
            >
              <span className="font-medium capitalize">{mode}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {mode === 'audit'
                  ? 'Report what it would do. Nothing is removed.'
                  : 'Actually remove the rights, once the switch above is on.'}
              </span>
            </button>
          ))}
        </div>
        {draft.mode === 'enforce' && !enforcementEnabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            The organisation&rsquo;s enforcement switch is off, so this will not remove anything
            until somebody turns it on.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Which machines</Label>
        {/* The scope model is shared with application policies on purpose:
            a machine must not be in scope for one kind of policy and out of
            scope for the other, and the resolver on the backend uses one
            function for both. Reusing the picker is the UI half of that. */}
        <ScopePicker
          scope={{ ...(draft.scope ?? { kind: 'tenant' }) }}
          onChange={scope =>
            set('scope', {
              kind: (scope?.kind ?? 'tenant') as PrivilegePolicy['scope']['kind'],
              group_ids: scope?.group_ids,
              agent_ids: scope?.agent_ids,
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pp-keep" className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Accounts that keep their rights
        </Label>
        <Textarea
          id="pp-keep"
          value={keepAdminText}
          onChange={e =>
            set(
              'keep_admin',
              e.target.value
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean),
            )
          }
          rows={3}
          placeholder={'One username per line\nsvc-backup\npriya'}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Matched without regard to case. Exemptions from every policy that applies to a machine are
          combined, so an exemption written here is never removed by a narrower policy elsewhere.
        </p>
      </div>

      {/* The break-glass account. Its own box, because it is the difference
          between a reversible change and a machine somebody has to physically
          visit. */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              Break-glass account
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              A managed local administrator the agent creates and keeps on every machine in scope,
              so a machine is never left without a way back in. Its password is shown once, when it
              is created.
            </p>
          </div>
          <Switch
            checked={draft.break_glass?.enabled ?? false}
            onCheckedChange={v =>
              set('break_glass', { ...(draft.break_glass ?? {}), enabled: v } as never)
            }
          />
        </div>

        {draft.break_glass?.enabled && (
          <div className="mt-3 space-y-2">
            <Input
              value={draft.break_glass?.username ?? ''}
              onChange={e =>
                set('break_glass', {
                  ...(draft.break_glass ?? { enabled: true }),
                  username: e.target.value,
                } as never)
              }
              placeholder="vsay-recovery"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Letters, digits, dot, dash and underscore only. If an account with this name already
              exists it is used as it is — it is never recreated and its password is never reset.
            </p>
          </div>
        )}

        {!draft.break_glass?.enabled && draft.demote_admins && (
          <p className="mt-3 text-xs text-muted-foreground">
            Without one, machines still keep whichever administrators are exempt or built in, and
            any machine that would be left with none is refused outright.
          </p>
        )}
      </div>

      {/* Elevation: how people get privilege back for a task. */}
      <div className="rounded-xl border border-border/60 p-4">
        <Label className="text-base">Getting privilege back</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          How somebody does the things they used to need administrator rights for. The agent
          performs these on their behalf — it does not hand out administrator rights, even
          temporarily, because during such a window somebody could stop the agent.
        </p>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Let people request software installs"
            hint="Already built: the agent raises the request, an approver answers it, and the agent installs it as root without granting anybody rights."
            checked={draft.elevation?.allow_install_requests ?? false}
            onChange={v =>
              set('elevation', {
                ...(draft.elevation ?? {}),
                allow_install_requests: v,
              } as never)
            }
          />
          <ToggleRow
            label="Let people request administrator rights"
            hint="Raised from the machine, approved in the portal, and expires on its own."
            checked={draft.elevation?.allow_admin_requests ?? false}
            onChange={v =>
              set('elevation', { ...(draft.elevation ?? {}), allow_admin_requests: v } as never)
            }
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="pp-sudo">Commands they may run as root</Label>
          <Textarea
            id="pp-sudo"
            value={(draft.elevation?.sudo_commands ?? []).map(c => c.path).join('\n')}
            onChange={e =>
              set('elevation', {
                ...(draft.elevation ?? {}),
                sudo_commands: e.target.value
                  .split('\n')
                  .map(s => s.trim())
                  .filter(Boolean)
                  .map(path => ({ path, any_arguments: true, no_password: true })),
              } as never)
            }
            rows={3}
            placeholder={'One absolute path per line\n/usr/sbin/installer\n/usr/bin/dscacheutil'}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Absolute paths only — a bare name would be resolved through the user&rsquo;s own PATH.
            These are written to the machine&rsquo;s sudoers file and checked by{' '}
            <code>visudo</code> before they are put in place.
          </p>
        </div>
      </div>

      {/* The simulation, between the form and the save button on purpose. */}
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label className="text-base">What this would do</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Run against the accounts your machines last reported. Nothing is saved and no machine
              is contacted.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={simulate} disabled={simulating}>
            {simulating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Simulate
          </Button>
        </div>

        {simulation && <SimulationResult simulation={simulation} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="pp-enabled"
            checked={draft.enabled ?? false}
            onCheckedChange={v => set('enabled', v)}
          />
          <Label htmlFor="pp-enabled" className="font-normal">
            Enabled
          </Label>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !draft.name?.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save policy
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SimulationResult({ simulation }: { simulation: PrivilegeSimulation }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Machines in scope" value={simulation.machines_in_scope} />
        <Stat label="Machines affected" value={simulation.machines_affected} />
        <Stat label="Accounts demoted" value={simulation.accounts_demoted} accent />
        <Stat label="Administrators kept" value={simulation.accounts_exempt} />
      </div>

      {/* Not the policy declining to act — the safety invariant stopping it.
          These machines need a break-glass account before the policy can do
          anything there, which is a different fix from "nothing matched". */}
      {simulation.machines_refused > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          <span className="font-medium">
            {simulation.machines_refused} machine{simulation.machines_refused === 1 ? '' : 's'} would
            be refused.
          </span>{' '}
          Removing rights there would leave nobody able to administer the machine, so the agent
          would apply nothing at all. Turn on the break-glass account, or exempt somebody.
        </div>
      )}

      {/* Every number above is only as complete as this one is small. */}
      {simulation.machines_not_reported > 0 && (
        <p className="text-xs text-muted-foreground">
          {simulation.machines_not_reported} machine
          {simulation.machines_not_reported === 1 ? ' has' : 's have'} not reported their accounts
          yet and are not counted above.
        </p>
      )}

      {simulation.changes && simulation.changes.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Machine</th>
                <th className="px-3 py-2 font-medium">Would lose rights</th>
              </tr>
            </thead>
            <tbody>
              {simulation.changes.map(change => (
                <tr key={change.agent_id} className="border-t border-border/40">
                  <td className="px-3 py-2">{change.machine_name}</td>
                  <td className="px-3 py-2">
                    {change.refused ? (
                      <span className="text-amber-500">Refused — {change.refused}</span>
                    ) : (
                      <span className="font-mono text-xs">{(change.demoted ?? []).join(', ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        This counts the accounts your machines last reported, not what people actually use. An
        account nobody signs into still counts.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className={cn('text-xl font-semibold', accent && value > 0 && 'text-amber-500')}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
