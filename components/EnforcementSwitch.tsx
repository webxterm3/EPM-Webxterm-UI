'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

/** The switch between a product that watches and one that closes somebody's
 *  browser.
 *
 *  It is a card of its own, above the policy list, rather than a field inside
 *  a policy. Turning enforcement on is one decision made once for the whole
 *  organisation, and burying it in a policy form would let it ride along
 *  unnoticed with an ordinary edit.
 *
 *  Turning it ON asks for confirmation and says what will happen. Turning it
 *  OFF does not: somebody reaching for that is very likely doing it because
 *  something is going wrong right now, and a confirmation dialog in front of a
 *  kill switch is an obstacle at exactly the wrong moment. */
export function EnforcementSwitch({
  enabled,
  saving,
  onChange,
}: {
  enabled: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handle = (next: boolean) => {
    if (next) setConfirming(true);
    else onChange(false);
  };

  return (
    <>
      <Card
        className={
          enabled
            ? 'glass-card border-amber-500/40 bg-amber-500/5'
            : 'glass-card border-blue-500/40 bg-blue-500/5'
        }
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-start gap-3">
            {enabled ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Enforcement</span>
                <Badge
                  variant="outline"
                  className={enabled ? 'border-amber-500/50 text-amber-500' : 'text-muted-foreground'}
                >
                  {enabled ? 'on' : 'audit only'}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {enabled ? (
                  <>
                    Policies set to <span className="font-medium text-foreground">enforce</span> are
                    blocking software on your machines right now. Policies set to audit still only
                    report.
                  </>
                ) : (
                  <>
                    Policies are evaluated and reported, and nothing is blocked on any machine.
                    Project a policy&apos;s impact first, then switch this on.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={enabled}
              disabled={saving}
              onCheckedChange={handle}
              aria-label="Enforce application policies"
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start enforcing application policies?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {/* Said in full, because the consequence lands on people who are
                  not in this room. */}
              <div className="space-y-3 text-sm">
                <p>On every machine running an agent, from the moment this is saved:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Software a policy blocks will be <strong>closed if it is running</strong>, with
                    no prompt and no chance to save work.
                  </li>
                  <li>
                    It will be <strong>prevented from launching</strong> again until the policy
                    changes.
                  </li>
                  <li>
                    Policies still set to <strong>audit</strong> continue to only report. This
                    switch does not change them.
                  </li>
                </ul>
                <p>
                  An agent refuses any policy that would block more than 50 applications on one
                  machine, so a single over-broad rule cannot take a fleet out — but a narrow rule
                  aimed at the wrong thing still will.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange(true)}>Turn enforcement on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
