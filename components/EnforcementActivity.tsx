'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Loader2, RotateCcw, ShieldOff, Trash2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { InfoBanner } from '@/components/TabHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  appControlAPI,
  describeEnforcedBy,
  describeMechanism,
  EnforcementEvent,
} from '@/lib/appcontrol-api';

const PAGE_SIZE = 50;

/** What endpoints actually did, as opposed to what policy says they should.
 *
 *  This is the answer to "why did my application stop working", and the only
 *  one there is: the decision was made on a laptop, by a process nobody was
 *  watching, possibly while it was offline.
 *
 *  agentId narrows it to one machine, for the machine details page. */
export default function EnforcementActivity({ agentId }: { agentId?: string }) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [events, setEvents] = useState<EnforcementEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [enforcing, setEnforcing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await appControlAPI.events(token, { page, limit: PAGE_SIZE, agentId });
      setEvents(res.events ?? []);
      setTotal(res.total);
      setEnforcing(res.enforcement_enabled);
    } catch (err) {
      toast({
        title: 'Could not load enforcement activity',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, page, agentId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!enforcing && (
        // Without this, an empty list reads as "nothing was ever blocked"
        // rather than "nothing was ever going to be".
        <InfoBanner title="Enforcement is off.">
          Nothing is being blocked on any machine, so this list only holds what happened while
          enforcement was previously on.
        </InfoBanner>
      )}

      {events.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <ShieldOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nothing has been blocked.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              When an agent closes or prevents an application, it is recorded here with the rule
              that decided it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <EventRow key={event.id} event={event} showMachine={!agentId} />
          ))}
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        onPageChange={setPage}
        label="events"
      />
    </div>
  );
}

function EventRow({ event, showMachine }: { event: EnforcementEvent; showMachine: boolean }) {
  const failed = event.outcome === 'failed';
  const refused = event.mechanism === 'refused';

  return (
    <Card className="glass-card">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <MechanismIcon mechanism={event.mechanism} failed={failed} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{event.app_name || 'A policy'}</span>
              <Badge variant="outline" className="text-[10px]">
                {describeMechanism(event.mechanism)}
              </Badge>
              {failed && (
                <Badge variant="outline" className="border-destructive/50 text-[10px] text-destructive">
                  failed
                </Badge>
              )}
            </div>

            <p className="truncate text-xs text-muted-foreground" title={event.path}>
              {event.path}
            </p>

            <p className="text-xs text-muted-foreground">
              {/* A decision with no rule came from the policy's catch-all,
                  which is a different conversation to have with whoever's
                  software stopped. */}
              {event.rule ? (
                <>
                  Rule <span className="text-foreground">{event.rule}</span>
                  {event.policy && <> · {event.policy}</>}
                </>
              ) : refused ? (
                'Nothing was applied'
              ) : (
                'Matched the policy’s default action, not a rule'
              )}
              {showMachine && event.machine_name && <> · {event.machine_name}</>}
            </p>

            {event.detail && (
              <p className={`text-xs ${failed || refused ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {event.detail}
              </p>
            )}
            {event.mechanism === 'quarantine' && !failed && (
              <p className="text-xs text-muted-foreground">
                Moved, not deleted — it is put back if the policy changes.
              </p>
            )}
            {event.enforced_by && event.mechanism === 'launch-lock' && !failed && (
              <p className="text-xs text-muted-foreground">{describeEnforcedBy(event.enforced_by)}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div title={new Date(event.at).toLocaleString()}>{new Date(event.at).toLocaleString()}</div>
          {/* The gap between the endpoint's clock and ours is how long the
              machine was offline, which is worth seeing. */}
          {reportingDelay(event) && <div className="mt-0.5">reported {reportingDelay(event)} later</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MechanismIcon({ mechanism, failed }: { mechanism: string; failed: boolean }) {
  const cls = 'mt-0.5 h-4 w-4 shrink-0';
  if (failed) return <AlertTriangle className={`${cls} text-destructive`} />;
  switch (mechanism) {
    case 'terminate':
      return <XCircle className={`${cls} text-amber-500`} />;
    case 'launch-lock':
      return <Ban className={`${cls} text-amber-500`} />;
    case 'launch-unlock':
    case 'restore':
      return <RotateCcw className={`${cls} text-emerald-500`} />;
    case 'quarantine':
      return <Trash2 className={`${cls} text-red-500`} />;
    case 'refused':
      return <AlertTriangle className={`${cls} text-amber-500`} />;
    default:
      return <ShieldOff className={cls} />;
  }
}

/** How long an event sat on a machine before it reached here.
 *
 *  Returns nothing under a minute, which is every event from a machine that
 *  was online — the number is only interesting when it is not small. */
function reportingDelay(event: EnforcementEvent): string | null {
  const gap = new Date(event.created_at).getTime() - new Date(event.at).getTime();
  const minutes = Math.round(gap / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
