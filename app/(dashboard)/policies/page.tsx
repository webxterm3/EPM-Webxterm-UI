'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2, Plus, ShieldCheck, Trash2, FlaskConical, Info, MonitorSmartphone, Clock, History,
} from 'lucide-react';

import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { policiesAPI, AppPolicy, SimulationResponse } from '@/lib/policies-api';
import {
  remoteAccessPoliciesAPI,
  RemoteAccessPolicy,
  newRemoteAccessPolicy,
  minutesToClock,
  DAY_NAMES,
} from '@/lib/remote-access-policies-api';
import PolicyEditor from '@/components/PolicyEditor';
import PolicySimulation from '@/components/PolicySimulation';
import RemoteAccessPolicyEditor from '@/components/RemoteAccessPolicyEditor';
import { TabHeader, InfoBanner } from '@/components/TabHeader';
import { EnforcementSwitch } from '@/components/EnforcementSwitch';
import EnforcementActivity from '@/components/EnforcementActivity';
import { appControlAPI } from '@/lib/appcontrol-api';

const ACTION_STYLES: Record<string, string> = {
  block: 'bg-red-500/15 text-red-400 border-red-500/30',
  elevate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  allow: 'bg-green-500/15 text-green-400 border-green-500/30',
  default: 'bg-muted text-muted-foreground border-border',
};

/** Application-control policies: what an operator wants to allow, block or
 *  elevate across the fleet — and, for now, what that would do if it were
 *  turned on. */
export default function PoliciesPage() {
  // useSearchParams needs a Suspense boundary to stay statically renderable.
  return (
    <Suspense fallback={null}>
      <PoliciesPageInner />
    </Suspense>
  );
}

function PoliciesPageInner() {
  const { token } = useAuth();
  const { toast } = useToast();
  const params = useSearchParams();

  const [policies, setPolicies] = useState<AppPolicy[]>([]);
  const [enforcementEnabled, setEnforcementEnabled] = useState(false);
  // undefined until the first load, so the notice is not shown before the
  // answer is known — a warning that flashes and withdraws reads as a fault.
  const [emailNotifications, setEmailNotifications] = useState<boolean | undefined>(undefined);
  const [savingEnforcement, setSavingEnforcement] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<AppPolicy | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Arriving from a machine's Applications tab with "Block this application".
  // A draft is OPENED, not saved: scope and the catch-all both still need a
  // human decision, and silently creating a block policy from one click in a
  // list is how a fleet-wide outage gets authored by accident.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || params.get('block') === null) return;
    setSeeded(true);
    setEditing(
      draftBlockPolicy({
        name: params.get('block') ?? '',
        publisher: params.get('publisher') ?? '',
        agent: params.get('agent') ?? '',
        bundleID: params.get('bundle_id') ?? '',
        path: params.get('path') ?? '',
      }),
    );
  }, [params, seeded]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await policiesAPI.list(token);
      setPolicies(res.policies ?? []);
      setEnforcementEnabled(res.enforcement_enabled);
      setEmailNotifications(res.email_notifications);
    } catch (err) {
      toast({
        title: 'Could not load policies',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setEnforcement = async (next: boolean) => {
    if (!token) return;
    setSavingEnforcement(true);
    try {
      const res = await appControlAPI.setEnforcement(token, next);
      setEnforcementEnabled(res.enforcement);
      toast({
        title: next ? 'Enforcement is on' : 'Enforcement is off',
        description: res.message,
      });
      // Reloaded rather than assumed: the server pushes the new mode to every
      // connected machine as part of this call, and the list should reflect
      // what it now reports rather than what we asked for.
      load();
    } catch (err) {
      toast({
        title: 'Could not change enforcement',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingEnforcement(false);
    }
  };

  const save = async (policy: AppPolicy) => {
    if (!token) return;
    try {
      const saved = policy.id
        ? await policiesAPI.update(token, policy.id, policy)
        : await policiesAPI.create(token, policy);
      toast({ title: policy.id ? 'Policy updated' : 'Policy created' });
      setEditing(null);
      load();
      // Saved is not the same as working, and the gap between the two is where
      // people lose afternoons: a policy scoped to one machine, or a rule with
      // one more condition than its author meant, saves perfectly and then
      // does nothing. The projection already answers "what would this do" —
      // it was just behind a button nobody had a reason to press.
      void reportWhatItWillDo(saved ?? policy);
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  /** Project the saved policy and say so when the answer is "nothing". */
  const reportWhatItWillDo = async (policy: AppPolicy) => {
    if (!token) return;
    try {
      const res = await policiesAPI.simulate(token, policy);
      const s = res.simulation?.summary;
      if (!s) return;

      if (s.machines_affected === 0) {
        toast({
          title: 'Saved — but it affects no machines',
          description:
            s.machines_evaluated === 0
              ? 'No machines have reported their software yet, so there is nothing to match against.'
              : `None of the ${s.machines_evaluated} machines in scope have software this policy matches. ` +
                'Check the "Applies to" section and the rule conditions — every field you fill in must match.',
          variant: 'destructive',
        });
        return;
      }
      if (s.installs_matched === 0) {
        toast({
          title: 'Saved — but no software matches',
          description:
            'The machines are in scope, but no installed application matches these rules. ' +
            'Every field you fill in must match at the same time, so an extra condition narrows the rule.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: `Matches ${s.installs_matched} install(s) on ${s.machines_affected} machine(s)`,
        description:
          policy.mode === 'enforce'
            ? 'Open Project impact to see exactly which.'
            : 'This policy is in audit mode, so nothing is blocked. Open Project impact to see what it would do.',
      });
    } catch {
      // The projection is advisory. A policy that saved is saved, and a
      // failure here must not read as a failure to save.
    }
  };

  const remove = async (policy: AppPolicy) => {
    if (!token || !policy.id) return;
    if (!confirm(`Delete “${policy.name}”? This cannot be undone.`)) return;
    try {
      await policiesAPI.remove(token, policy.id);
      toast({ title: 'Policy deleted' });
      load();
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const simulate = async (policy: AppPolicy) => {
    if (!token) return;
    setSimulating(true);
    setSimulation(null);
    try {
      setSimulation(await policiesAPI.simulate(token, policy));
    } catch (err) {
      toast({
        title: 'Simulation failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Policies' }]} />

      <div>
        <h1 className="text-2xl font-semibold">Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What software may run, and who may connect to your machines.
        </p>
      </div>

      <Tabs defaultValue="applications">
        <TabsList className="mb-6">
          <TabsTrigger value="applications" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="remote-access" className="gap-2">
            <MonitorSmartphone className="h-4 w-4" />
            Remote Access
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-6">
          <TabHeader
            description="What software may run on your machines. Rules are evaluated top to bottom and the first match decides."
            action={
              <Button onClick={() => setEditing(newPolicy())} className="gap-2">
                <Plus className="h-4 w-4" />
                New policy
              </Button>
            }
          />

          {/* The most important control on this page, and above the list
              rather than inside a policy: whether any of this acts on
              somebody's machine is one decision for the whole organisation. */}
          <EnforcementSwitch
            enabled={enforcementEnabled}
            saving={savingEnforcement}
            onChange={setEnforcement}
          />

          {/* Said here because this is the screen where the rules that trigger
              the alerts are written. Without it, an administrator who adds an
              elevate rule and waits for the mail that never comes cannot tell
              a quiet fleet from a server with no mail configured. */}
          {emailNotifications === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <span className="font-medium">Email alerts are not being sent.</span>{' '}
              This server has no SMTP configured, so nothing is mailed when an application
              is granted administrator rights, when a rule cannot be honoured, or when a
              remote session starts. Everything is still recorded here and in the activity
              below.
            </div>
          )}

          {editing ? (
            <PolicyEditor
          policy={editing}
          onCancel={() => {
            setEditing(null);
            setSimulation(null);
          }}
          onSave={save}
          onSimulate={simulate}
          simulating={simulating}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
            </div>
          ) : policies.length === 0 ? (
            <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No policies yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              A policy is an ordered list of rules. The first rule that matches an application
              decides what happens to it, so put your exceptions above your broad rules.
            </p>
          </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
          {policies.map(policy => (
            <Card key={policy.id} className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {policy.name}
                      {!policy.enabled && (
                        <Badge variant="outline" className="text-[10px]">
                          disabled
                        </Badge>
                      )}
                      {/* Whether this policy is actually doing anything depends on
                          TWO switches — its own mode and the organisation-wide
                          Enforcement switch — and an operator who has set one but
                          not the other had no way to tell. A policy that looks
                          saved and does nothing is the worst state this page can
                          be in, so the answer is on the card itself. */}
                      <PolicyModeBadge policy={policy} enforcementEnabled={enforcementEnabled} />
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {describeScope(policy)} · {policy.rules?.length ?? 0} rule
                      {(policy.rules?.length ?? 0) === 1 ? '' : 's'} · defaults to{' '}
                      {policy.default_action}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => simulate(policy)} className="gap-1.5">
                      <FlaskConical className="h-3.5 w-3.5" />
                      Project impact
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(policy)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(policy)}
                      aria-label={`Delete ${policy.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {(policy.rules?.length ?? 0) > 0 && (
                <CardContent className="pt-0">
                  <ol className="space-y-1.5">
                    {policy.rules.map((rule, i) => (
                      <li key={rule.id} className="flex items-center gap-3 text-sm">
                        {/* Numbered, because first-match-wins is only
                            predictable if the order is visible. */}
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        <Badge
                          variant="outline"
                          className={`w-16 justify-center text-[10px] ${ACTION_STYLES[rule.action] ?? ''}`}
                        >
                          {rule.action}
                        </Badge>
                        <span className={rule.enabled ? '' : 'text-muted-foreground line-through'}>
                          {rule.name}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              )}
            </Card>
          ))}
            </div>
          )}

          {simulating && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Projecting across your fleet…
            </div>
          )}
          {simulation && !simulating && (
            <PolicySimulation result={simulation} onClose={() => setSimulation(null)} />
          )}
        </TabsContent>

        <TabsContent value="remote-access" className="space-y-6">
          <RemoteAccessPolicies />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <TabHeader description="What your machines actually did: software closed, launches prevented, applications restored. Decisions are made on the endpoint, so this is the only record of them." />
          <EnforcementActivity />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** What this policy is actually doing, right now, on the fleet.
 *
 *  Three states, not two. A policy set to enforce while the organisation-wide
 *  switch is off is neither enforcing nor merely auditing — it is waiting, and
 *  saying "audit" there would be a lie that costs somebody an afternoon. */
function PolicyModeBadge({
  policy,
  enforcementEnabled,
}: {
  policy: AppPolicy;
  enforcementEnabled: boolean;
}) {
  if (policy.mode !== 'enforce') {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        audit only — nothing is blocked
      </Badge>
    );
  }
  if (!enforcementEnabled) {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-500">
        waiting — turn on Enforcement above
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-500/50 text-[10px] text-red-500">
      enforcing
    </Badge>
  );
}

function describeScope(policy: { scope?: { kind?: string; group_ids?: string[]; agent_ids?: string[] } }): string {
  switch (policy.scope?.kind) {
    case 'group':
      return `${policy.scope.group_ids?.length ?? 0} group(s)`;
    case 'machine':
      return `${policy.scope.agent_ids?.length ?? 0} machine(s)`;
    default:
      return 'All machines';
  }
}

/** A one-rule block policy, pre-filled from an installed application.
 *
 *  Bundle ID is only set for a macOS application. Populated criteria are
 *  ANDed, so carrying an empty bundle ID onto a Windows app would produce a
 *  rule that matches nothing — the easiest way to author a block that
 *  silently does nothing at all.
 */
function draftBlockPolicy(app: {
  name: string;
  publisher: string;
  agent: string;
  bundleID: string;
  path: string;
}): AppPolicy {
  // What the machine actually reports, written into the description.
  //
  // People ask where the path went, and the honest answer is that it is a
  // terrible condition and a useful fact. A path is where ONE machine happens
  // to keep ONE application; matching on it narrows the rule to that machine.
  // But not showing it at all left somebody guessing at the exact strings the
  // other fields are being matched against, which is its own way to write a
  // rule that silently matches nothing.
  const reported = [
    `name "${app.name}"`,
    app.publisher && `publisher "${app.publisher}"`,
    app.bundleID && `bundle id "${app.bundleID}"`,
    app.path && `path "${app.path}"`,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    name: `Block ${app.name}`,
    description:
      `Created from the Applications tab of ${app.agent || 'a machine'}.\n` +
      `That machine reports: ${reported}.\n` +
      `The path is shown for reference only — matching on it would tie this rule ` +
      `to one machine's layout.`,
    enabled: true,
    // Scoped to the one machine it was raised from. Widening it to the whole
    // fleet is a deliberate edit, never the default.
    scope: app.agent ? { kind: 'machine', agent_ids: [app.agent] } : { kind: 'tenant' },
    mode: 'audit',
    priority: 0,
    // Allow, not block: this policy exists to stop ONE application. A
    // catch-all block would quietly turn it into an allow-list covering
    // everything else on the machine.
    default_action: 'allow',
    rules: [
      {
        id: `r-${Date.now()}`,
        name: `Block ${app.name}`,
        enabled: true,
        action: 'block',
        match: {
          app_name: { op: 'equals', values: [app.name] },
          publisher: { op: 'equals', values: app.publisher ? [app.publisher] : [] },
          file_path: { op: 'contains', values: [] },
          bundle_id: { op: 'equals', values: app.bundleID ? [app.bundleID] : [] },
        },
      },
    ],
  };
}

function newPolicy(): AppPolicy {
  return {
    name: '',
    enabled: true,
    scope: { kind: 'tenant' },
    mode: 'audit',
    priority: 0,
    default_action: 'allow',
    rules: [],
  };
}

/** Remote-access policies: who may connect to which machines, by what means,
 *  when, and under what conditions. */
function RemoteAccessPolicies() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [policies, setPolicies] = useState<RemoteAccessPolicy[]>([]);
  const [recordingAvailable, setRecordingAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RemoteAccessPolicy | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await remoteAccessPoliciesAPI.list(token);
      setPolicies(res.policies ?? []);
      setRecordingAvailable(res.recording_available);
    } catch (err) {
      toast({
        title: 'Could not load remote access policies',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (policy: RemoteAccessPolicy) => {
    if (!token) return;
    try {
      if (policy.id) await remoteAccessPoliciesAPI.update(token, policy.id, policy);
      else await remoteAccessPoliciesAPI.create(token, policy);
      toast({ title: policy.id ? 'Policy updated' : 'Policy created' });
      setEditing(null);
      load();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const remove = async (policy: RemoteAccessPolicy) => {
    if (!token || !policy.id) return;
    if (!confirm(`Delete “${policy.name}”?`)) return;
    try {
      await remoteAccessPoliciesAPI.remove(token, policy.id);
      toast({ title: 'Policy deleted' });
      load();
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  if (editing) {
    return (
      <RemoteAccessPolicyEditor
        policy={editing}
        recordingAvailable={recordingAvailable}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    );
  }

  return (
    <div className="space-y-6">
      <TabHeader
        description="Who may connect to which machines, by what means, and when."
        action={
          <Button onClick={() => setEditing(newRemoteAccessPolicy())} className="gap-2">
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        }
      />

      <InfoBanner>
        These <strong className="text-foreground">narrow</strong> access, never widen it. Somebody
        who is not already an owner or granted user of a machine cannot be let in by a policy. With
        no policy, everyone who already has access keeps it.
      </InfoBanner>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : policies.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <MonitorSmartphone className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No remote access policies.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Everyone who already has access to a machine can connect to it, at any time, by any
              means. Add a policy to restrict that — to a support group, to business hours, or to
              sessions that are recorded.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.map(policy => (
            <Card key={policy.id} className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {policy.name}
                      {!policy.enabled && (
                        <Badge variant="outline" className="text-[10px]">
                          disabled
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">{describeScope(policy)}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(policy)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(policy)}
                      aria-label={`Delete ${policy.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-2 pt-0 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {policy.allow_attended && <Badge variant="outline" className="text-[10px]">Attended</Badge>}
                  {policy.allow_unattended && <Badge variant="outline" className="text-[10px]">Unattended</Badge>}
                  {policy.allow_terminal && <Badge variant="outline" className="text-[10px]">Terminal</Badge>}
                  {policy.require_consent && <Badge variant="outline" className="text-[10px]">Consent required</Badge>}
                  {policy.require_reason && <Badge variant="outline" className="text-[10px]">Reason required</Badge>}
                  {policy.require_recording && <Badge variant="outline" className="text-[10px]">Recorded</Badge>}
                  {policy.max_session_minutes > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      Max {policy.max_session_minutes} min
                    </Badge>
                  )}
                </div>

                {(policy.time_windows?.length ?? 0) > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {policy.time_windows!.map(describeWindow).join('; ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function describeWindow(w: { days?: number[]; start_minute: number; end_minute: number; timezone?: string }): string {
  const days = (w.days?.length ?? 0) === 0 ? 'Every day' : w.days!.map(d => DAY_NAMES[d]).join(', ');
  return `${days} ${minutesToClock(w.start_minute)}–${minutesToClock(w.end_minute)} ${w.timezone || 'UTC'}`;
}
