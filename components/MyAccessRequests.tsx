'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, Plus, RefreshCw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SelectInput } from '@/components/FilterBar';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  ACCESS_LEVELS,
  AccessRequest,
  accessRequestsAPI,
  formatDuration,
  requestMinutes,
} from '@/lib/access-requests-api';
import { Machine, machinesAPI } from '@/lib/machines-api';

/** What somebody asks for when they need to reach a machine, and what became
 *  of it.
 *
 *  Separate from the approver's view: this is one person's own requests, and
 *  the only actions on it are to make another one. Mixing the two would put an
 *  Approve button in front of the person who asked. */

/** How a duration is entered: a number and a unit.
 *
 *  It used to be a fixed list of hours, because the grant was STORED as an
 *  int of hours — so fifteen minutes rounded to zero, and zero was overloaded
 *  to mean NEVER EXPIRES. The shortest window on the list handed out
 *  permanent access. The stored field is minutes now, so the unit is a real
 *  choice rather than a label on a rounding error. */
const DURATION_UNITS = [
  { value: 'minutes', label: 'minutes', perUnit: 1 },
  { value: 'hours', label: 'hours', perUnit: 60 },
  { value: 'days', label: 'days', perUnit: 60 * 24 },
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number]['value'];

/** Thirty days, matching the server. A request for a year is almost always a
 *  typo, and granting one is harder to notice than refusing it. */
const MAX_MINUTES = 30 * 24 * 60;

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  approved: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-border' },
  expired: { label: 'Expired', className: 'bg-muted text-muted-foreground border-border' },
  rejected: { label: 'Rejected', className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  revoked: { label: 'Revoked', className: 'bg-red-500/15 text-red-500 border-red-500/30' },
};

/* Keyed by string, with a fallback, rather than by the status union.
 *
 * The union is this file's idea of what the backend can send, and the
 * backend can outgrow it at any time — it just did, with 'completed'. The
 * lookup was dereferenced with no fallback, so the first request carrying a
 * status this map had not heard of threw while rendering and took the whole
 * page with it. An unknown status is now shown as itself. */
function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? {
    label: status || 'Unknown',
    className: 'bg-muted text-muted-foreground border-border',
  };
}

function when(ts?: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function MyAccessRequests() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await accessRequestsAPI.getMy(token);
      setRequests(res.requests ?? []);
    } catch (err) {
      toast({
        title: 'Could not load your requests',
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Machines you have asked to reach, and what an approver decided.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setComposing(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New request
          </Button>
        </div>
      </div>

      {composing && (
        <NewRequestForm
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            load();
          }}
        />
      )}

      {loading && requests.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : requests.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">You have not asked for access to anything.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              A request names the machine and how long you need it. Someone who administers
              that machine decides, and the grant ends on its own.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Machine</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">For</th>
                <th className="px-4 py-2.5 font-medium">Requested</th>
                <th className="px-4 py-2.5 font-medium">Ends</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map(r => {
                const style = statusStyle(r.status);
                return (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.title || r.machine_name || '—'}</div>
                      {r.title && (
                        <div className="text-xs text-muted-foreground">{r.machine_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={style.className}>
                        {style.label}
                      </Badge>
                      {r.status === 'rejected' && r.reject_comment && (
                        <p className="mt-1 text-xs text-muted-foreground">{r.reject_comment}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{formatDuration(requestMinutes(r))}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{when(r.requested_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.status === 'approved' ? when(r.expires_at) : '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground" title={r.request_note}>
                      {r.request_note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewRequestForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(30);
  const [unit, setUnit] = useState<DurationUnit>('minutes');
  const [machineId, setMachineId] = useState('');

  const [scheduled, setScheduled] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The three asks, each independent. A request can carry more than one:
  // diagnosing a crash often needs to watch the screen AND install a
  // debugger, and splitting that into two requests means two approvals and
  // two windows somebody has to line up by hand.
  const [wantSupport, setWantSupport] = useState(true);
  const [supportReason, setSupportReason] = useState('');
  const [control, setControl] = useState<'view_only' | 'full_control'>('view_only');

  const [wantAdmin, setWantAdmin] = useState(false);
  const [adminReason, setAdminReason] = useState('');

  const [wantInstall, setWantInstall] = useState(false);
  const [installReason, setInstallReason] = useState('');
  /* Which of the three things is being asked for. Install by default,
   * because it is what this section meant before the choice existed. */
  const [installOp, setInstallOp] = useState<'install' | 'update' | 'remove'>('install');
  const [apps, setApps] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // forRequest: the machines somebody may ASK about, which is not the
        // same set as the ones they can already reach — the whole point is to
        // request one they cannot.
        const res = await machinesAPI.listMachines(token, { forRequest: true, limit: 200 });
        if (!cancelled) setMachines(res.machines ?? []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load machines',
            description: err instanceof Error ? err.message : 'Error',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingMachines(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const chosen = useMemo(() => machines.find(m => m.id === machineId), [machines, machineId]);

  // A scheduled window states its own length, so the duration follows it
  // rather than sitting beside it as a second answer to the same question.
  const windowMinutes = useMemo(() => {
    if (!scheduled || !from || !to) return null;
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Number.isFinite(ms) ? Math.round(ms / 60000) : null;
  }, [scheduled, from, to]);

  const minutes =
    windowMinutes ?? amount * (DURATION_UNITS.find(u => u.value === unit)?.perUnit ?? 1);

  const appList = apps
    .split(/[\n,]/)
    .map(a => a.trim())
    .filter(Boolean);

  const problem = (() => {
    if (!machineId) return 'Choose the machine you need to reach.';
    if (!title.trim()) return 'Give the request a name, so an approver can tell it from the others.';
    if (!wantSupport && !wantAdmin && !wantInstall) {
      return 'Turn on at least one thing you need — a request that asks for nothing cannot be approved.';
    }
    if (wantInstall && appList.length === 0) {
      return 'Name the applications you need to install.';
    }
    if (scheduled && (!from || !to)) return 'A scheduled window needs both a start and an end.';
    if (windowMinutes !== null && windowMinutes <= 0) return 'The window has to end after it starts.';
    if (minutes < 1) return 'A request needs a length. Access that never ends is not what this is for.';
    if (minutes > MAX_MINUTES) return 'That is longer than 30 days, which is the most that can be asked for.';
    return null;
  })();

  const submit = async () => {
    if (!token || problem) return;
    setSaving(true);
    try {
      await accessRequestsAPI.create(token, {
        machineId,
        title: title.trim(),
        durationMinutes: minutes,
        requestNote: note.trim(),
        asks: {
          ...(wantSupport && {
            remote_support: { reason: supportReason.trim(), control },
          }),
          ...(wantAdmin && { admin_access: { reason: adminReason.trim() } }),
          ...(wantInstall && {
            app_install: { reason: installReason.trim(), applications: appList, operation: installOp },
          }),
        },
        // datetime-local gives a local wall-clock string with no zone; the
        // server wants RFC3339, so it is converted here rather than guessed
        // there.
        notBefore: scheduled && from ? new Date(from).toISOString() : undefined,
        notAfter: scheduled && to ? new Date(to).toISOString() : undefined,
      });
      toast({
        title: 'Request sent',
        description: `Waiting for someone who administers ${chosen?.name ?? 'that machine'} to decide.`,
      });
      onCreated();
    } catch (err) {
      toast({
        title: 'Could not send the request',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-medium">New access request</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The grant ends on its own when the time is up — you do not have to give it back.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ar-title">Name</Label>
            <Input
              id="ar-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Fix the failed deployment on build-01"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              One line. This is what an approver sees in a list of requests.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ar-note">Why you need it</Label>
            <Textarea
              id="ar-note"
              rows={4}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={'The service is crashing on start and the logs are only on the machine.'}
            />
            <p className="text-xs text-muted-foreground">
              A request with no reason is one the approver has to come back and ask about.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ar-duration">For how long</Label>
              <div className="flex gap-2">
                <Input
                  id="ar-duration"
                  type="number"
                  min={1}
                  value={amount}
                  disabled={windowMinutes !== null}
                  onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
                  className="w-24"
                />
                <Select
                  value={unit}
                  onValueChange={v => setUnit(v as DurationUnit)}
                  disabled={windowMinutes !== null}
                >
                  <SelectTrigger className="flex-1" aria-label="Duration unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_UNITS.map(u => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {windowMinutes !== null
                  ? `${formatDuration(minutes)} — taken from the window below`
                  : `${formatDuration(minutes)} · counted from the moment it is approved`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ar-machine">Select machine</Label>
              <Select value={machineId} onValueChange={setMachineId} disabled={loadingMachines}>
                <SelectTrigger id="ar-machine">
                  <SelectValue placeholder={loadingMachines ? 'Loading…' : 'Select machine'} />
                </SelectTrigger>
                <SelectContent>
                  {machines.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingMachines && machines.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  There is nothing here to request. Either you already reach every machine, or
                  none has been enrolled yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* When the session may run.
            Separate from the approval time on purpose: somebody can ask on
            Monday for a window on Saturday, and starting the clock when the
            approver clicks would spend a short grant before it could be
            used. */}
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Switch checked={scheduled} onCheckedChange={setScheduled} />
            Schedule this for later
          </label>
          {scheduled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ar-from">From</Label>
                <Input id="ar-from" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ar-to">To</Label>
                <Input id="ar-to" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The session can start as soon as somebody approves it.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label>What you need</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Turn on everything this session needs. Each one is approved on its own terms.
            </p>
          </div>

          <AskSection
            title="Remote Support"
            hint="See or drive the machine to fix something."
            enabled={wantSupport}
            onToggle={setWantSupport}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ar-support-why">What will happen in this session</Label>
              <Textarea
                id="ar-support-why"
                rows={2}
                value={supportReason}
                onChange={e => setSupportReason(e.target.value)}
                placeholder="Reproduce the crash and read the service logs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ar-control">How much control</Label>
              <Select value={control} onValueChange={v => setControl(v as typeof control)}>
                <SelectTrigger id="ar-control">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map(l => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ACCESS_LEVELS.find(l => l.value === control)?.hint}
              </p>
            </div>
          </AskSection>

          <AskSection
            title="Admin Access"
            hint="Administrator rights on the machine."
            enabled={wantAdmin}
            onToggle={setWantAdmin}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ar-admin-why">What needs administrator rights</Label>
              <Textarea
                id="ar-admin-why"
                rows={2}
                value={adminReason}
                onChange={e => setAdminReason(e.target.value)}
                placeholder="Restart the service and clear its cache directory"
              />
            </div>
          </AskSection>

          <AskSection
            title="Applications"
            hint="Permission to install, update or remove named software."
            enabled={wantInstall}
            onToggle={setWantInstall}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ar-install-op">What do you need to do</Label>
              {/* Asked, not assumed. An approver seeing "Docker Desktop" has
                  to know whether it is going onto the machine or coming off;
                  approving the wrong one is not a mistake they can see. */}
              <SelectInput
                id="ar-install-op"
                aria-label="What do you need to do"
                value={installOp}
                onChange={v => setInstallOp(v as 'install' | 'update' | 'remove')}
              >
                <option value="install">Install it</option>
                <option value="update">Update it</option>
                <option value="remove">Remove it</option>
              </SelectInput>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ar-apps">Which applications</Label>
              <Textarea
                id="ar-apps"
                rows={2}
                value={apps}
                onChange={e => setApps(e.target.value)}
                placeholder={'Docker Desktop\nWireshark'}
              />
              {/* Named rather than left open: "may install software" and "may
                  install Docker Desktop" are different grants, and only the
                  second is one an approver can actually weigh. */}
              <p className="text-xs text-muted-foreground">
                One per line, or separated by commas.
                {appList.length > 0 && ` · ${appList.length} named`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ar-install-why">Why</Label>
              <Textarea
                id="ar-install-why"
                rows={2}
                value={installReason}
                onChange={e => setInstallReason(e.target.value)}
                placeholder="Needed to capture the traffic between the service and the database"
              />
            </div>
          </AskSection>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-destructive">{problem}</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!!problem || saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** One thing a request can ask for: a switch, what it means, and the detail
 *  that only matters once it is on.
 *
 *  The detail is hidden rather than disabled while the switch is off. A form
 *  of greyed-out fields reads as broken, and these are genuinely not part of
 *  the request until somebody asks for that thing. */
function AskSection({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        enabled ? 'border-primary/30 bg-primary/5' : 'border-border/60',
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} className="mt-0.5" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </label>
      {enabled && <div className="mt-4 space-y-3 pl-[3.25rem]">{children}</div>}
    </div>
  );
}
