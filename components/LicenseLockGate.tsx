'use client';

import { usePathname } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useLicense } from '@/contexts/LicenseContext';

export function LicenseLockGate({ children }: { children: React.ReactNode }) {
  const { license, loading } = useLicense();
  const pathname = usePathname();

  // Render nothing until we know the license state — prevents a flash of
  // locked page content before the gate check resolves.
  if (loading) return null;

  const locked = license?.state === 'locked';

  // Always allow the license page — that's where users go to understand the state
  if (!locked || pathname === '/license') {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
        <ShieldOff className="size-8 text-destructive" />
      </div>
      <div className="max-w-md space-y-3">
        <h2 className="text-xl font-semibold">License Expired</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your WebXterm EPM license has expired. All functionality is disabled
          and no machines or services can be accessed.
        </p>
        <p className="text-sm font-medium text-destructive">
          Renew your license to continue using WebXterm EPM.
        </p>
        <p className="text-xs text-muted-foreground">
          Contact your administrator or visit the license portal to renew.
        </p>
      </div>
      <Link
        href="/license"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        View License Details
      </Link>
    </div>
  );
}
