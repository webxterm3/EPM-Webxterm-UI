'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, UserCog, AlertTriangle, KeyRound, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  fleetConfigAPI,
  FleetConfig,
  FleetUpgradeResult,
  DefaultUserSweep,
} from '@/lib/fleet-config-api';

/** Organisation-wide configuration, for a super administrator.
 *
 *  Everything here reaches further than the other settings: one of them
 *  updates every agent in the estate at once, and the other decides what
 *  happens on machines that have not been enrolled yet. That is why the tab
 *  is gated on super_admin — not because it is more technical.
 */
export default function FleetConfiguration() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState<FleetConfig | null>(null);
  const [secretsAvailable, setSecretsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fleetConfigAPI.get(token);
      setConfig(res.config);
      setSecretsAvailable(res.secrets_available);
    } catch (err) {
      toast({
        title: 'Could not load the configuration',
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading configuration…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UpgradeAllAgents />
      <DefaultAccount config={config} secretsAvailable={secretsAvailable} onSaved={load} />
    </div>
  );
}

/** Updates every agent in the organisation. */
function UpgradeAllAgents() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FleetUpgradeResult | null>(null);

  const upgrade = useCallback(async () => {
    if (!token) return;
    setRunning(true);
    setConfirming(false);
    try {
      const res = await fleetConfigAPI.upgradeAgents(token);
      setResult(res);
      toast({
        title: `Update requested on ${res.requested} machine${res.requested === 1 ? '' : 's'}`,
        description: res.message,
      });
    } catch (err) {
      toast({
        title: 'Could not start the update',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  }, [token, toast]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4" />
          Update every agent
        </CardTitle>
        <CardDescription>
          Asks every machine that is online to download and install the current agent. Each one does
          it on its own and comes back a minute or two later.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={running} className="gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {running ? 'Sending…' : 'Update all agents'}
          </Button>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-medium">Every online machine will restart its agent.</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• Remote sessions in progress will be cut off.</li>
              <li>• Offline machines are skipped and are not retried automatically.</li>
              <li>• A machine already on this version downloads it again and restarts.</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={upgrade}>
                Update all agents
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="font-medium">{result.requested}</span> asked to update
              </span>
              <span className="text-muted-foreground">{result.offline} offline</span>
              {result.revoked > 0 && (
                <span className="text-muted-foreground">{result.revoked} revoked</span>
              )}
              <span className="text-muted-foreground">of {result.total} total</span>
            </div>

            {/* Counted apart from failures on purpose: nothing is broken,
                there is simply no package published for that platform, and
                an operator reading "failed" would go looking for a fault
                that is not there. */}
            {result.no_package.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No package is published for {result.no_package.length} machine
                {result.no_package.length === 1 ? '' : 's'}: {result.no_package.join(', ')}
              </p>
            )}
            {result.failed.length > 0 && (
              <p className="text-xs text-destructive">
                Could not reach: {result.failed.join(', ')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The local account every newly enrolled machine gets. */
function DefaultAccount({
  config,
  secretsAvailable,
  onSaved,
}: {
  config: FleetConfig | null;
  secretsAvailable: boolean;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();

  const du = config?.default_user;

  const [enabled, setEnabled] = useState(du?.enabled ?? false);
  const [username, setUsername] = useState(du?.username ?? '');
  const [fullName, setFullName] = useState(du?.full_name ?? '');
  const [admin, setAdmin] = useState(du?.admin ?? false);
  const [hidden, setHidden] = useState(du?.hidden ?? false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [sweep, setSweep] = useState<DefaultUserSweep | null>(null);

  const hasPassword = du?.has_password ?? false;

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fleetConfigAPI.save(token, {
        default_user: {
          enabled,
          username: username.trim(),
          full_name: fullName.trim(),
          // Only when it is being changed. Empty leaves the stored one alone,
          // so editing the full name does not require re-typing a credential
          // nobody can read back.
          password,
          admin,
          hidden,
        },
      });
      setPassword('');
      // The save also applies the account to machines that already exist, so
      // the result is shown rather than left to be discovered.
      if (res.sweep && (res.sweep.requested > 0 || res.sweep.offline > 0)) {
        setSweep(res.sweep);
      }
      toast({
        title: 'Configuration saved',
        description: res.sweep?.requested
          ? `Asked ${res.sweep.requested} machine${res.sweep.requested === 1 ? '' : 's'} to create the account.`
          : undefined,
      });
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [token, enabled, username, fullName, password, admin, hidden, toast, onSaved]);

  const applyNow = useCallback(async () => {
    if (!token) return;
    setApplying(true);
    try {
      const res = await fleetConfigAPI.applyDefaultUser(token);
      setSweep(res.sweep);
      toast({
        title: `Asked ${res.sweep.requested} machine${res.sweep.requested === 1 ? '' : 's'}`,
        description:
          res.sweep.offline > 0
            ? `${res.sweep.offline} are offline and will be asked when they next connect.`
            : undefined,
      });
    } catch (err) {
      toast({
        title: 'Could not apply to existing machines',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  }, [token, toast]);

  const usernameLooksRight = /^[A-Za-z0-9._-]{1,32}$/.test(username);
  const needsPassword = enabled && !hasPassword && password.length < 10;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4" />
          Default account on new machines
        </CardTitle>
        <CardDescription>
          When this is on, the account is created on every machine in the organisation — the ones
          already enrolled as well as the ones that arrive later.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Create this account on new machines</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Applied once per machine. Saving also applies it to machines that already exist;
              offline ones are asked the moment they next connect.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fc-username">Username</Label>
            <Input
              id="fc-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="itsupport"
              className="font-mono text-sm"
            />
            {username !== '' && !usernameLooksRight && (
              <p className="text-xs text-destructive">
                Letters, digits, dot, dash and underscore only.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fc-fullname">Full name</Label>
            <Input
              id="fc-fullname"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="IT Support"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fc-password" className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            Password
          </Label>
          <Input
            id="fc-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={
              hasPassword ? 'Set — type a new one to replace it' : 'At least 10 characters'
            }
            className="max-w-md font-mono text-sm"
            disabled={!secretsAvailable}
          />
          {hasPassword && password === '' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3 w-3" />A password is set. It is never shown again — leave this
              blank to keep it.
            </p>
          )}
          {/* Said plainly, because this is the one password in the product
              that IS stored, and somebody should know why. */}
          <p className="text-xs text-muted-foreground">
            This password has to be stored, because it is applied to machines that have not enrolled
            yet. It is encrypted on the server and never sent back to this page.
          </p>
          {!secretsAvailable && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This server has no encryption key configured, so a password cannot be stored. Set{' '}
                <code>CONFIG_ENCRYPT_KEY</code> on the backend and restart it.
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Make it an administrator</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Off by default. Leave it off unless this account has to administer machines.
              </p>
            </div>
            <Switch checked={admin} onCheckedChange={setAdmin} />
          </div>

          {admin && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <span className="font-medium">
                This creates an administrator on every machine in the organisation.
              </span>{' '}
              One account, one password, standing administrator rights everywhere — and a way around
              everything least privilege enforces, on the whole fleet at once. Exempt it in your
              privilege policy, or it will be demoted by the next pass.
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Hide from the sign-in screen</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A hidden administrator account is also what a backdoor looks like, and the Accounts
                tab flags that combination.
              </p>
            </div>
            <Switch checked={hidden} onCheckedChange={setHidden} />
          </div>
        </div>

        {sweep && (
          <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="font-medium">{sweep.requested}</span> asked
              </span>
              {sweep.already_done > 0 && (
                <span className="text-muted-foreground">{sweep.already_done} had it already</span>
              )}
              {/* Offline is NOT a failure: these are asked the moment they
                  next connect, by the same hook that handles a brand-new
                  enrolment. Calling it failed would send somebody looking
                  for a fault that is not there. */}
              {sweep.offline > 0 && (
                <span className="text-muted-foreground">
                  {sweep.offline} offline — asked when they reconnect
                </span>
              )}
              <span className="text-muted-foreground">of {sweep.total} total</span>
            </div>
            {sweep.failed.length > 0 && (
              <p className="text-xs text-destructive">Could not reach: {sweep.failed.join(', ')}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Each machine reports back what it did. A machine that already has an account with this
              name refuses, and says so in the audit trail.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {config?.updated_by ? `Last changed by ${config.updated_by}.` : ''}
            </p>
            {/* Safe to press repeatedly: a machine that has already been
                asked is skipped, so this never creates duplicate requests. */}
            {du?.enabled && du?.has_password && (
              <Button variant="outline" size="sm" onClick={applyNow} disabled={applying}>
                {applying && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Apply to existing machines
              </Button>
            )}
          </div>
          <Button
            onClick={save}
            disabled={saving || (enabled && (!usernameLooksRight || needsPassword))}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
