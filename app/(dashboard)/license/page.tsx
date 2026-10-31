'use client';

import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Clock,
  Building2,
  Package,
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  FlaskConical,
} from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { LicenseStatus } from '@/lib/license-api';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function StateIcon({ state }: { state: LicenseStatus['state'] }) {
  if (state === 'locked') return <ShieldOff className="size-6 text-destructive" />;
  if (state === 'grace') return <ShieldAlert className="size-6 text-yellow-500" />;
  // Dev mode is NOT a healthy licence, and a green tick said it was.
  //
  // There is no licence at all here — nothing was checked and nothing is
  // enforced. The shield was the same one a paid, valid licence gets, which
  // is the one thing this screen must never do: the whole reason somebody
  // opens it is to find out whether they are licensed.
  if (state === 'dev') return <FlaskConical className="size-6 text-blue-500" />;
  return <ShieldCheck className="size-6 text-primary" />;
}

function StateBadge({ state }: { state: LicenseStatus['state'] }) {
  const cls =
    state === 'locked'
      ? 'bg-destructive/10 text-destructive border-destructive/20'
      : state === 'grace'
      ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400'
      : state === 'dev'
      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400'
      : 'bg-primary/10 text-primary border-primary/20';
  // "Development Mode", not "Active". The fall-through used to label it
  // Active, which is a claim about a licence that does not exist.
  const label =
    state === 'locked'
      ? 'Locked'
      : state === 'grace'
      ? 'Grace Period'
      : state === 'dev'
      ? 'Development Mode'
      : 'Active';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold', cls)}>
      {label}
    </span>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0 border-border/50">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function ExpiryBar({ daysRemaining }: { daysRemaining: number }) {
  const total = 365;
  const pct = Math.max(0, Math.min(100, (daysRemaining / total) * 100));
  const color =
    daysRemaining <= 0
      ? 'bg-destructive'
      : daysRemaining <= 15
      ? 'bg-yellow-500'
      : daysRemaining <= 30
      ? 'bg-orange-500'
      : 'bg-primary';
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** What to show where a licence would have put a value.
 *
 *  An em dash is right when a licence exists and simply left a field blank.
 *  It is wrong in dev mode, where the field is empty because there is no
 *  licence at all — and a page of dashes reads as a page that failed to
 *  load rather than one saying something definite.
 */
function devValue(license: LicenseStatus, whenDev: string): string {
  return license.state === 'dev' ? whenDev : '—';
}

export default function LicensePage() {
  const { license, loading, refresh } = useLicense();
  const [error] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    if (license) setLastChecked(new Date());
  }, [license]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const expiryLabel = (days: number | null) => {
    if (days === null) return 'No expiry';
    if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`;
    if (days === 0) return 'Expires today';
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
  };

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'License' }]} className="mb-6" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            License
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your WebXterm EPM license status and details.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !license && (
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <RefreshCw className="size-4 animate-spin" />
          Loading license status…
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <ShieldOff className="size-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {license && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Status card */}
          <Card className={cn(
            'lg:col-span-1',
            license.state === 'locked' && 'border-destructive/40',
            license.state === 'grace' && 'border-yellow-500/40',
            license.state === 'dev' && 'border-blue-500/40',
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">License Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <StateIcon state={license.state} />
                <div>
                  <StateBadge state={license.state} />
                </div>
              </div>

              {license.days_remaining !== null && (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Validity</span>
                    <span className={cn(
                      'font-medium',
                      license.days_remaining <= 0 ? 'text-destructive' :
                      license.days_remaining <= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'
                    )}>
                      {expiryLabel(license.days_remaining)}
                    </span>
                  </div>
                  <ExpiryBar daysRemaining={license.days_remaining} />
                </div>
              )}

              {license.state === 'grace' && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Your license has expired. The service will lock in 48 hours. Contact your administrator to renew.
                    </p>
                  </div>
                </div>
              )}

              {license.state === 'locked' && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="flex gap-2">
                    <ShieldOff className="size-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">
                      License expired and grace period exhausted. API access is blocked. Contact your administrator immediately.
                    </p>
                  </div>
                </div>
              )}

              {license.state === 'ok' && license.days_remaining !== null && license.days_remaining <= 15 && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      License expires soon. Please contact your administrator to renew before the grace period begins.
                    </p>
                  </div>
                </div>
              )}

              {license.state === 'dev' && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                  <div className="flex gap-2">
                    <FlaskConical className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
                      <p className="font-medium">
                        {license.message || 'License enforcement is disabled (dev mode).'}
                      </p>
                      <p>
                        No license is installed and nothing is being checked. Every feature is
                        available, machine numbers are not counted, and nothing will ever expire
                        or lock.
                      </p>
                      <p>
                        This is for development only. A production deployment must be given a
                        real license, or it will go on reporting this.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {license.state === 'ok' && (license.days_remaining === null || license.days_remaining > 15) && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <div className="flex gap-2">
                    <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-primary/80">License is valid and all services are running normally.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details card */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">License Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                {/* Shown FIRST, and shown always.
                    Every other row below describes a licence. This one says
                    whether any of them are being acted on — which in dev mode
                    is the only true statement on the card. */}
                <DetailRow
                  icon={license.enforcement ? ShieldCheck : ShieldOff}
                  label="Enforcement"
                  value={
                    license.enforcement ? (
                      <span>On — limits and expiry are applied</span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400">
                        Off — nothing on this page is being enforced
                      </span>
                    )
                  }
                />
                <DetailRow
                  icon={Building2}
                  label="Licensed to"
                  value={license.company || devValue(license, 'No license installed')}
                />
                <DetailRow
                  icon={Package}
                  label="Plan"
                  value={
                    <span className="capitalize">
                      {license.plan || devValue(license, 'Development')}
                    </span>
                  }
                />
                <DetailRow
                  icon={Server}
                  label="Machine quota"
                  value={
                    // "Unlimited" on its own was the most misleading line on
                    // the page: a quota of 0 means "no limit recorded", and
                    // in dev mode that is because there is no licence to
                    // record one — not because somebody bought the top plan.
                    license.machine_quota > 0
                      ? `${license.machine_quota} machines`
                      : license.state === 'dev'
                      ? 'Unlimited — not counted in dev mode'
                      : 'Unlimited'
                  }
                />
                <DetailRow
                  icon={Clock}
                  label="Expiry date"
                  value={
                    license.expires_at ? (
                      <span>
                        {formatDate(license.expires_at)}{' '}
                        <span className={cn(
                          'text-xs ml-1',
                          (license.days_remaining ?? 999) <= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
                        )}>
                          ({expiryLabel(license.days_remaining)})
                        </span>
                      </span>
                    ) : (
                      devValue(license, 'Never — no license to expire')
                    )
                  }
                />
                <DetailRow
                  icon={ShieldCheck}
                  label="License ID"
                  value={
                    <code className="text-xs font-mono text-muted-foreground break-all">
                      {license.license_id || devValue(license, 'None')}
                    </code>
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Last checked footer */}
          {lastChecked && (
            <p className="lg:col-span-3 text-xs text-muted-foreground text-right">
              Last checked: {lastChecked.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
