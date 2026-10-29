'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldOff, X } from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const DISMISS_KEY = 'epm-license-banner-dismissed';

// Shows a dismissible banner when:
//   • state = 'grace'  (expired, 48h window)
//   • state = 'locked'  (fully locked — not dismissible)
//   • state = 'ok' and days_remaining <= 15  (approaching expiry)
// Dismissed state is stored per-day in localStorage so it re-shows daily.
export function LicenseExpiryBanner() {
  const { license } = useLicense();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Re-show the banner once per day even if dismissed
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored) {
        const dismissedDate = new Date(stored).toDateString();
        const today = new Date().toDateString();
        if (dismissedDate === today) setDismissed(true);
      }
    } catch {}
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {}
  };

  if (!license) return null;

  const { state, days_remaining } = license;

  // Locked banner is never suppressible — even if the user dismissed during grace today
  if (dismissed && state !== 'locked') return null;
  const warn15 = state === 'ok' && days_remaining !== null && days_remaining <= 15;
  const showBanner = state === 'grace' || state === 'locked' || warn15;
  if (!showBanner) return null;

  const isLocked = state === 'locked';
  const isGrace = state === 'grace';

  const bannerCls = isLocked
    ? 'bg-destructive/10 border-destructive/30 text-destructive'
    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300';

  const Icon = isLocked ? ShieldOff : AlertTriangle;

  const message = isLocked
    ? 'Your WebXterm EPM license has expired and the grace period is exhausted. API access is blocked. Contact your administrator immediately.'
    : isGrace
    ? 'Your WebXterm EPM license has expired. The service will lock in 48 hours. Please contact your administrator to renew.'
    : `Your WebXterm EPM license expires in ${days_remaining} day${days_remaining !== 1 ? 's' : ''}. Contact your administrator to renew before the grace period begins.`;

  return (
    <div className={cn('relative border-b px-4 py-3', bannerCls)}>
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <Icon className="size-4 shrink-0 mt-0.5" />
        <p className="flex-1 text-sm">
          {message}{' '}
          <Link href="/license" className="font-semibold underline underline-offset-2 hover:opacity-75">
            View license details →
          </Link>
        </p>
        {!isLocked && (
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
