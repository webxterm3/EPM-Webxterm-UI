'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, ShieldQuestion, XOctagon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { remoteControlAPI, RemoteControlSession } from '@/lib/remote-control-api';

interface Props {
  agentId: string | undefined;
  /** Called after a session is ended, so the page can re-enable Start. */
  onEnded?: () => void;
}

/** Shows whether a remote-control session is in progress on this machine, and
 *  offers a way to end it.
 *
 *  # Why this exists
 *
 *  A session that ends badly — the machine sleeps, the network drops, the
 *  operator's tab is killed before it can say so — used to leave a record on
 *  the server claiming to be active. Every later attempt to connect was then
 *  refused with "a session is already in progress", and nothing in the portal
 *  showed the session or offered to end it. The only cure anybody found was
 *  restarting the backend.
 *
 *  The server now clears a session whose agent has gone. This is the other
 *  half: when a session IS in progress — legitimately or not — it is visible
 *  here and can be ended from here.
 */
export default function RemoteSessionState({ agentId, onEnded }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [session, setSession] = useState<RemoteControlSession | null>(null);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    if (!token || !agentId) return;
    try {
      setSession(await remoteControlAPI.getStatus(token, agentId));
    } catch {
      // Transient. Showing an error here would put a red box on a tab whose
      // subject is a session that probably is not running at all.
      setSession(null);
    }
  }, [token, agentId]);

  // Polled rather than fetched once: the session can start or end from
  // another tab, from the machine, or from the server's own cleanup, and a
  // stale "in progress" here is exactly the confusion this screen exists to
  // remove.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const end = useCallback(async () => {
    if (!token || !agentId) return;
    setEnding(true);
    try {
      await remoteControlAPI.stop(token, agentId);
      toast({
        title: 'Session ended',
        description: 'The machine has been told to stop sharing its screen.',
      });
      setSession(null);
      onEnded?.();
      // Re-read rather than trusting the local clear: the machine may not
      // have accepted, and the operator should see that rather than a tab
      // that looks fixed.
      setTimeout(load, 1500);
    } catch (err) {
      toast({
        title: 'Could not end the session',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setEnding(false);
    }
  }, [token, agentId, toast, onEnded, load]);

  const state = session?.state;
  const running = state === 'active' || state === 'awaiting_consent';

  if (!running) return null;

  return (
    <div
      className={cn(
        'mb-6 rounded-xl border p-4 text-left',
        state === 'active' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border/60 bg-muted/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {state === 'active' ? (
            <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          ) : (
            <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">
              {state === 'active'
                ? 'A remote-control session is in progress'
                : 'Waiting for the user to approve a session'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {session?.admin_name ? `Started by ${session.admin_name}.` : ''}
              {session?.started_at
                ? ` Since ${new Date(session.started_at).toLocaleTimeString()}.`
                : ''}
              {session?.view_only ? ' View only.' : ''}
            </p>
            {/* Said because it is the thing somebody is actually trying to
                work out when they arrive here: why Start is refusing. */}
            <p className="mt-1 text-xs text-muted-foreground">
              A new session cannot start while this one is open.
            </p>
          </div>
        </div>

        <Button variant="destructive" size="sm" onClick={end} disabled={ending} className="gap-2">
          {ending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XOctagon className="h-3.5 w-3.5" />
          )}
          {ending ? 'Ending…' : 'End session'}
        </Button>
      </div>
    </div>
  );
}
