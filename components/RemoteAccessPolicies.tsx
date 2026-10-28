'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, MonitorSmartphone, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  RemoteAccessPolicy,
  newRemoteAccessPolicy,
  remoteAccessPoliciesAPI,
} from '@/lib/remote-access-policies-api';
import RemoteAccessPolicyEditor from '@/components/RemoteAccessPolicyEditor';
import { InfoBanner, TabHeader } from '@/components/TabHeader';
import { describeScope, describeWindow } from '@/lib/policy-scope';

/** Who may take over a machine, when, and for how long.
 *
 *  Moved out of Policies and into Remote Access: it is the rule that governs
 *  the requests on the tabs beside it, and reading it next to application
 *  control — which decides what software may RUN — put two unrelated
 *  questions under one word. */

export default function RemoteAccessPolicies() {
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
