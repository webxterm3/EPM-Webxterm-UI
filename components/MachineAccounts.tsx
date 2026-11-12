'use client';

import { useCallback, useEffect, useMemo, useState, type SelectHTMLAttributes } from 'react';
import {
  Loader2,
  Search,
  Users,
  AlertCircle,
  ShieldAlert,
  RefreshCw,
  EyeOff,
  Ban,
  Building2,
  UserPlus,
  Copy,
  Check,
  MoreHorizontal,
  ShieldPlus,
  ShieldMinus,
  Clock,
  Power,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accountsAPI, LocalAccount, NewAccount, AccountActionRequest } from '@/lib/accounts-api';

interface Props {
  token: string | null;
  agentId: string | undefined;
}

/** The user accounts on one machine, and which of them hold administrator
 *  rights.
 *
 *  Read-only. Nothing on this screen changes an account on any endpoint — it
 *  is the evidence least-privilege policy will be written from, and it exists
 *  before any enforcement does so that a rollout can be planned from real
 *  numbers rather than from an assumption about who has admin.
 *
 *  Kept out of the machine details page because that file is already ~2,700
 *  lines; it loads lazily when its tab is opened. */
export default function MachineAccounts({ token, agentId }: Props) {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [admins, setAdmins] = useState(0);
  const [demotable, setDemotable] = useState(0);
  const [reported, setReported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<LocalAccount | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!token || !agentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await accountsAPI.forMachine(token, agentId, {
        search: search.trim(),
        adminsOnly,
        limit: 500,
      });
      setAccounts(res.accounts ?? []);
      setAdmins(res.administrators ?? 0);
      setDemotable(res.demotable ?? 0);
      setReported(res.reported ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, [token, agentId, search, adminsOnly]);

  /** Ask the agent to scan now, then reload once it has had time to report.
   *
   *  The reload is on a timer rather than on the response because the response
   *  only means "the agent was asked". Reloading immediately would re-render
   *  the same list and read as the button doing nothing.
   */
  const scanNow = useCallback(async () => {
    if (!token || !agentId || scanning) return;
    setScanning(true);
    try {
      const res = await accountsAPI.requestScan(token, agentId);
      toast({ title: 'Scan requested', description: res.message });

      // An account scan is a directory-service read, measured at 76ms for 135
      // accounts on a real machine — far quicker than the software scan. Four
      // seconds is almost entirely round-trip time.
      setTimeout(() => {
        load();
        setScanning(false);
      }, 4000);
    } catch (err) {
      // An offline machine answers 409 with a sentence worth showing verbatim
      // — it explains that the list refreshes on its own at reconnect.
      toast({
        title: 'Could not start the scan',
        description: err instanceof Error ? err.message : 'The agent did not accept the request.',
        variant: 'destructive',
      });
      setScanning(false);
    }
  }, [token, agentId, scanning, load, toast]);

  /** Carry out one action on one account.
   *
   *  The list is reloaded on a timer rather than at once, because the answer
   *  only means the agent was asked: the change lands a second or two later,
   *  and the endpoint can still refuse it. Reloading immediately would show
   *  the old state under the word "done".
   */
  const act = useCallback(
    async (request: AccountActionRequest) => {
      if (!token || !agentId) return;
      setBusy(request.username);
      try {
        const res = await accountsAPI.manage(token, agentId, request);
        toast({ title: 'Asked the machine', description: res.message });
        setTimeout(() => {
          load();
          setBusy(null);
        }, 4000);
      } catch (err) {
        toast({
          title: 'Could not make the change',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
        setBusy(null);
      }
    },
    [token, agentId, toast, load],
  );

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading accounts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // A machine that has never reported and a machine with no accounts look
  // identical in a list — and no machine has no accounts, so the empty list
  // always means the first thing. Saying so is the point of the flag.
  if (!reported) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">This machine has not reported its accounts yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Agents scan when they connect and then every few hours. A machine that has just been
          enrolled, or one running an older agent, will not appear here yet.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={scanNow}
          disabled={scanning || !agentId}
          className="mt-4 gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />
          {scanning ? 'Scanning…' : 'Scan now'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="admins-only" checked={adminsOnly} onCheckedChange={setAdminsOnly} />
            <Label htmlFor="admins-only" className="text-sm font-normal text-muted-foreground">
              Administrators only
            </Label>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={scanNow}
            disabled={scanning || !agentId}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />
            {scanning ? 'Scanning…' : 'Scan now'}
          </Button>

          <Button size="sm" onClick={() => setAdding(true)} disabled={!agentId} className="gap-2">
            <UserPlus className="h-3.5 w-3.5" />
            Add account
          </Button>
        </div>
      </div>

      {/* A dialog rather than a panel in the flow. It is opened from a row
          that may be far down a long table, and a panel renders at the top
          where whoever clicked is not looking. */}
      <GrantUntilDialog
        account={picking}
        onClose={() => setPicking(null)}
        onChoose={until => {
          const target = picking;
          setPicking(null);
          if (!target) return;
          act({ action: 'set-admin', username: target.username, value: true, until });
        }}
      />

      {adding && (
        <AddAccountForm
          token={token}
          agentId={agentId}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            // Reloaded on a timer rather than at once: the machine creates
            // the account a second or two from now, and an immediate reload
            // would show the old list under the word "created".
            setTimeout(load, 4000);
          }}
        />
      )}

      {/* Both numbers, always, because the difference between them is the
          thing an operator most needs before planning anything: the gap is
          root and any directory accounts, which hold administrator rights
          this product will not remove. Showing only the first would promise
          a rollout that cannot be delivered. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{accounts.length}</span> account
          {accounts.length === 1 ? '' : 's'}
        </span>
        <span>
          <span className="font-medium text-foreground">{admins}</span> administrator
          {admins === 1 ? '' : 's'}
        </span>
        <span>
          <span className="font-medium text-foreground">{demotable}</span> that policy could act on
        </span>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {search ? `Nothing matching “${search}”.` : 'No accounts match this filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Rights</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Admin since / until</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr
                  key={acc.id}
                  className={cn('border-t border-border/40', !acc.present && 'opacity-50')}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{acc.username}</span>
                      {!acc.present && (
                        <Badge variant="outline" className="text-[10px]">
                          deleted
                        </Badge>
                      )}
                      {acc.disabled && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Ban className="h-2.5 w-2.5" />
                          disabled
                        </Badge>
                      )}
                      {/* Hidden AND admin is what a backdoor account looks
                          like, so it is called out rather than left to
                          whoever notices the shell column. */}
                      {acc.hidden && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'gap-1 text-[10px]',
                            acc.is_admin && 'border-amber-500/50 text-amber-500',
                          )}
                        >
                          <EyeOff className="h-2.5 w-2.5" />
                          hidden
                        </Badge>
                      )}
                    </div>
                    {(acc.full_name || acc.uid) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {acc.full_name}
                        {acc.full_name && acc.uid ? ' · ' : ''}
                        {acc.uid ? `uid ${acc.uid}` : ''}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    {acc.is_admin ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Administrator
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Standard user</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5">
                    {!acc.is_local ? (
                      // The distinction that decides whether policy may ever
                      // act on this account, so it gets a label rather than
                      // being inferred from the username's shape.
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        Directory
                      </span>
                    ) : acc.is_admin && !acc.demotable ? (
                      // An administrator policy will not touch. Saying why
                      // here is what stops somebody counting it into a
                      // rollout and then asking why it did not move.
                      <span className="text-xs text-muted-foreground">
                        Built-in · not removable
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Local</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {/* When rights END is the more useful of the two for an
                        account that has a grant, so it wins the column. */}
                    {acc.is_admin && acc.admin_until ? (
                      <span
                        className="inline-flex items-center gap-1 text-amber-500"
                        title={absoluteTime(acc.admin_until)}
                      >
                        <Clock className="h-3 w-3" />
                        until {shortTime(acc.admin_until)}
                      </span>
                    ) : acc.is_admin && acc.admin_since ? (
                      formatWhen(acc.admin_since)
                    ) : (
                      '—'
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    <AccountActions
                      account={acc}
                      busy={busy === acc.username}
                      onAct={act}
                      onPickTime={() => setPicking(acc)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'at an unknown time';

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The form for creating a local account on this machine.
 *
 *  Two things about it are deliberate and worth knowing.
 *
 *  The password is generated in this browser and shown here, because it is
 *  never stored anywhere afterwards — not in the database, not in the audit
 *  trail, not in a log on the machine. Whoever fills this in is the only
 *  person who will ever know it, so the form says so rather than letting them
 *  find out when they go looking for it.
 *
 *  "Administrator" is off by default and warns when turned on. An
 *  administrator created here is a standing way around everything least
 *  privilege enforces on that machine, which is a reasonable thing to want
 *  and an unreasonable thing to do by accident.
 */
function AddAccountForm({
  token,
  agentId,
  onCancel,
  onCreated,
}: {
  token: string | null;
  agentId: string | undefined;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewAccount>({
    username: '',
    full_name: '',
    password: generatePassword(),
    admin: false,
    hidden: false,
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const set = <K extends keyof NewAccount>(key: K, value: NewAccount[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const usernameLooksRight = /^[A-Za-z0-9._-]{1,32}$/.test(form.username);
  const passwordLongEnough = (form.password ?? '').length >= 10;

  const submit = async () => {
    if (!token || !agentId) return;
    setSaving(true);
    try {
      const res = await accountsAPI.create(token, agentId, form);
      toast({ title: 'Creating the account', description: res.message });
      onCreated();
    } catch (err) {
      // An offline machine answers 409 with a sentence worth showing
      // verbatim, and the endpoint's own refusals (a name already taken)
      // arrive the same way.
      toast({
        title: 'Could not create the account',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and over plain HTTP.
      // The password is visible in the field either way, so this is a
      // convenience failing rather than the form failing.
      toast({ title: 'Could not copy — select the password and copy it by hand' });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      <div>
        <h4 className="font-medium">New local account</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Created on this machine by the agent. An account that already exists is never taken over —
          the request is refused instead.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="acc-username">Username</Label>
          <Input
            id="acc-username"
            value={form.username}
            onChange={e => set('username', e.target.value)}
            placeholder="priya"
            className="font-mono text-sm"
          />
          {form.username !== '' && !usernameLooksRight && (
            <p className="text-xs text-destructive">
              Letters, digits, dot, dash and underscore only, up to 32 characters.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="acc-fullname">Full name</Label>
          <Input
            id="acc-fullname"
            value={form.full_name ?? ''}
            onChange={e => set('full_name', e.target.value)}
            placeholder="Priya Sharma"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="acc-password">Password</Label>
        <div className="flex gap-2">
          <Input
            id="acc-password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            className="font-mono text-sm"
          />
          <Button type="button" variant="outline" size="icon" onClick={copyPassword} title="Copy">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => set('password', generatePassword())}
          >
            Regenerate
          </Button>
        </div>
        {/* Said plainly, because the alternative is somebody closing this
            panel and then going to look for the password. */}
        <p className="text-xs text-muted-foreground">
          Copy this now. It is sent to the machine and used once, and is never stored — not here,
          not in the audit trail, not on the machine. It cannot be retrieved afterwards.
        </p>
        {!passwordLongEnough && <p className="text-xs text-destructive">At least 10 characters.</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Make this account an administrator</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Off by default. Leave it off unless somebody needs to administer this machine.
            </p>
          </div>
          <Switch checked={form.admin ?? false} onCheckedChange={v => set('admin', v)} />
        </div>

        {form.admin && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">This account will be able to undo least privilege.</span>{' '}
            An administrator on this machine can restore their own rights, stop the agent and
            install anything. It is also a candidate for demotion by your privilege policy unless
            you exempt it.
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Hide from the sign-in screen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A hidden administrator account is also what a backdoor looks like, and this list flags
              that combination.
            </p>
          </div>
          <Switch checked={form.hidden ?? false} onCheckedChange={v => set('hidden', v)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || !usernameLooksRight || !passwordLongEnough}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </div>
    </div>
  );
}

/** Generates a password in the browser.
 *
 *  From crypto.getRandomValues, not Math.random: this is the credential for an
 *  account on somebody's endpoint, and Math.random is predictable enough that
 *  a sequence of generated passwords could be reconstructed.
 *
 *  The alphabet leaves out the characters people misread when they type a
 *  password off a screen — O/0, l/1/I — because that is exactly how this one
 *  will be delivered.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // A trailing symbol and digit, so the result satisfies the complexity rules
  // Windows applies by default. Without them account creation fails there
  // with an error the person who typed the form cannot act on.
  return out + '7!';
}

/** How long a temporary grant can last.
 *
 *  Offered as a short list rather than a free-text duration, because the
 *  question "how long does this person need administrator rights" has a small
 *  number of real answers and a box invites somebody to type 9999.
 */
const GRANT_DURATIONS: { label: string; minutes: number }[] = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: 'Rest of the day (8 hours)', minutes: 480 },
  { label: '24 hours', minutes: 1440 },
  { label: '3 days', minutes: 3 * 1440 },
];

/** The per-account actions menu.
 *
 *  What it offers depends on what the account IS, so that nothing in the menu
 *  is a no-op. An account that cannot be demoted — root, a built-in, a
 *  directory account — is not offered a demotion that the endpoint would
 *  refuse, because a menu item that always fails teaches people to ignore
 *  failures.
 */
function AccountActions({
  account,
  busy,
  onAct,
  onPickTime,
}: {
  account: LocalAccount;
  busy: boolean;
  onAct: (request: AccountActionRequest) => void;
  onPickTime: () => void;
}) {
  // A row for an account that no longer exists is history, not something to
  // act on.
  if (!account.present) return null;

  // Rights on a directory account are not ours to change with a local group
  // edit, and nothing here would work.
  const canChangeRights = account.is_local;

  // Removing rights from a built-in is refused by the endpoint, so it is not
  // offered. Granting them to one is pointless — they have them.
  const canRemoveRights = canChangeRights && account.demotable;
  const canGrantRights = canChangeRights && !account.is_admin;

  const nothingToOffer = !canRemoveRights && !canGrantRights && !canChangeRights;
  if (nothingToOffer) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">Actions for {account.username}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {account.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {canGrantRights && (
          <>
            {/* Said as "never expires", not just "make administrator".
                The two options below it end; this one does not, and that is
                the thing somebody choosing between them needs to see. */}
            <DropdownMenuItem
              onClick={() =>
                onAct({ action: 'set-admin', username: account.username, value: true })
              }
            >
              <ShieldPlus className="mr-2 h-3.5 w-3.5" />
              <span>
                Make administrator
                <span className="block text-[11px] text-muted-foreground">Never expires</span>
              </span>
            </DropdownMenuItem>

            <DropdownMenuLabel className="pt-2 text-[11px] font-normal text-muted-foreground">
              <Clock className="mr-1 inline h-3 w-3" />
              Administrator for a limited time
            </DropdownMenuLabel>
            {GRANT_DURATIONS.map(d => (
              <DropdownMenuItem
                key={d.minutes}
                className="pl-8 text-sm"
                onClick={() =>
                  onAct({
                    action: 'set-admin',
                    username: account.username,
                    value: true,
                    duration_minutes: d.minutes,
                  })
                }
              >
                {d.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="pl-8 text-sm" onClick={onPickTime}>
              Pick a date and time…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {canRemoveRights && (
          <>
            <DropdownMenuItem
              onClick={() =>
                onAct({ action: 'set-admin', username: account.username, value: false })
              }
            >
              <ShieldMinus className="mr-2 h-3.5 w-3.5" />
              Make standard user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Disable, never delete. A deleted account takes its home directory
            and its file ownership with it; disabling answers the same need
            and can be undone. */}
        <DropdownMenuItem
          onClick={() =>
            onAct({
              action: 'set-enabled',
              username: account.username,
              value: Boolean(account.disabled),
            })
          }
        >
          <Power className="mr-2 h-3.5 w-3.5" />
          {account.disabled ? 'Enable account' : 'Disable account'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Picks how long a grant of administrator rights lasts.
 *
 *  # Why this is not one `datetime-local` input
 *
 *  It was. A native datetime-local depends on the browser to draw a picker,
 *  and two of them do not: Safari on the desktop renders a bare text field,
 *  and in a dark theme the WebKit picker indicator is a dark glyph on a dark
 *  background — present, invisible, and indistinguishable from "this feature
 *  is missing".
 *
 *  So the control is built from parts that always render: a number and a
 *  unit for a length of time, and a date with explicit hour and minute
 *  selects for an exact one. Nothing here needs the browser to supply a
 *  widget.
 *
 *  # Timezones
 *
 *  The pieces are assembled with `new Date(y, m, d, h, min)`, which builds
 *  the instant in THIS browser's timezone — the one whose clock the person
 *  choosing is reading. It is sent as an ISO string carrying that offset, so
 *  what arrives is the instant they picked rather than the same digits in
 *  whichever zone the server runs in.
 */
function GrantUntilDialog({
  account,
  onClose,
  onChoose,
}: {
  /** The account to grant to, or null when the dialog is shut.
   *
   *  Driven by the account rather than a separate boolean so the two cannot
   *  disagree — an open dialog with no account would have nothing to grant
   *  to, and a closed one holding an account would reopen on the next
   *  unrelated render. */
  account: LocalAccount | null;
  onClose: () => void;
  onChoose: (untilISO: string) => void;
}) {
  return (
    <Dialog open={account !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Administrator rights for <span className="font-mono">{account?.username ?? ''}</span>
          </DialogTitle>
          <DialogDescription>
            The rights are removed by the machine itself when the time arrives — including while it
            is asleep or offline, and across a restart.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while the dialog is open, so every opening starts
            fresh.
            Kept mounted, the form would carry the previous account's choice
            into the next one — and worse, its default end time is computed
            when it mounts, so a dialog opened an hour after the page loaded
            would default to a time that has already passed. */}
        {account && <GrantUntilForm onClose={onClose} onChoose={onChoose} />}
      </DialogContent>
    </Dialog>
  );
}

/** The body of the grant dialog. See GrantUntilDialog for why it is separate. */
function GrantUntilForm({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (untilISO: string) => void;
}) {
  const [mode, setMode] = useState<'length' | 'exact'>('length');

  // A length of time.
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>('hours');

  // An exact moment, defaulting to an hour from now rounded to five minutes.
  const initial = useMemo(() => {
    const t = new Date(Date.now() + 60 * 60 * 1000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    return t;
  }, []);
  const [date, setDate] = useState(() => toDateInputValue(initial));
  const [hour, setHour] = useState(() => String(initial.getHours()));
  const [minute, setMinute] = useState(() => String(initial.getMinutes()));

  const chosen = useMemo(() => {
    if (mode === 'length') {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) return null;
      const perUnit = unit === 'minutes' ? 1 : unit === 'hours' ? 60 : 1440;
      return new Date(Date.now() + n * perUnit * 60 * 1000);
    }

    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return null;
    // Built in local time on purpose: these digits are what the person is
    // reading off their own clock.
    const t = new Date(y, m - 1, d, Number(hour), Number(minute), 0, 0);
    return Number.isNaN(t.getTime()) ? null : t;
  }, [mode, amount, unit, date, hour, minute]);

  const minutesAway = chosen ? Math.round((chosen.getTime() - Date.now()) / 60000) : 0;

  // The same limits the backend enforces, checked here so somebody is told
  // before they submit rather than after.
  const tooSoon = chosen !== null && minutesAway < 5;
  const tooFar = chosen !== null && minutesAway > 7 * 24 * 60;
  const usable = chosen !== null && !tooSoon && !tooFar;

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="flex gap-2">
          {(
            [
              ['length', 'For a length of time'],
              ['exact', 'Until an exact time'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                'flex-1 rounded-lg border p-2 text-sm',
                mode === key ? 'border-primary bg-primary/5 font-medium' : 'border-border/60',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'length' ? (
          <div className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="grant-amount">How long</Label>
              <Input
                id="grant-amount"
                type="number"
                min={1}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-unit" className="sr-only">
                Unit
              </Label>
              <NativeSelect
                id="grant-unit"
                value={unit}
                onChange={e => setUnit(e.target.value as typeof unit)}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </NativeSelect>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="grant-date">Date</Label>
              <Input
                id="grant-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                // The WebKit picker glyph is dark-on-dark in a dark theme.
                // Inverting it there is the difference between a control that
                // looks broken and one that works.
                className="w-44 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-hour">Hour</Label>
              <NativeSelect id="grant-hour" value={hour} onChange={e => setHour(e.target.value)}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-minute">Minute</Label>
              <NativeSelect
                id="grant-minute"
                value={minute}
                onChange={e => setMinute(e.target.value)}
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        )}

        {/* The instant that will actually be sent, spelled out with its zone.
          "until 17:00" with no zone is the kind of thing two people read
          differently and only find out about afterwards. */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          {chosen ? (
            <>
              <span className="text-muted-foreground">Rights end at </span>
              <span className="font-medium">{absoluteTime(chosen.toISOString())}</span>
              <span className="text-muted-foreground"> — {describeAway(minutesAway)} from now</span>
            </>
          ) : (
            <span className="text-muted-foreground">Choose a time.</span>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Your timezone is <span className="font-medium">{zone}</span>.
          </p>
          {tooSoon && <p className="mt-1 text-xs text-destructive">At least 5 minutes from now.</p>}
          {tooFar && <p className="mt-1 text-xs text-destructive">At most 7 days from now.</p>}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!usable} onClick={() => chosen && onChoose(chosen.toISOString())}>
          Grant until this time
        </Button>
      </DialogFooter>
    </>
  );
}

/** A plain select, styled to match the Input.
 *
 *  Native on purpose. This control exists because the browser-supplied date
 *  picker could not be relied on to appear; building its replacement out of a
 *  component that renders its own popup would be the same bet again.
 */
function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm',
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** Formats a Date as YYYY-MM-DD in LOCAL time.
 *
 *  toISOString would be wrong: it converts to UTC, so near midnight the field
 *  would open on the wrong day.
 */
function toDateInputValue(t: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** "2 hours", "3 days" — how far away a chosen time is. */
function describeAway(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

/** A short end time in the reader's own timezone. */
function shortTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'an unknown time';

  const sameDay = t.toDateString() === new Date().toDateString();
  return t.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
  });
}

/** The full time with its zone, for a tooltip.
 *
 *  The short form above drops the zone to stay short, which is fine while it
 *  is one of several times on a screen the reader owns — and not fine as the
 *  only record of when somebody's rights end. This is the unambiguous one.
 */
function absoluteTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'an unknown time';
  return t.toLocaleString(undefined, { timeZoneName: 'short' });
}
