'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Header } from '@/components/layout/Header';
import { LicenseExpiryBanner } from '@/components/LicenseExpiryBanner';
import { LicenseLockGate } from '@/components/LicenseLockGate';
import { LicenseProvider } from '@/contexts/LicenseContext';
import { useAuth } from '@/contexts/AuthContext';
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // AuthContext resolves `isAuthenticated` from localStorage, which doesn't
  // exist during SSR — the server always renders as logged-out. If we branch
  // on `isAuthenticated` immediately, an already-logged-in client's very
  // first (hydration) render already sees `true` and renders the full
  // sidebar tree where the server rendered nothing, causing a hydration
  // mismatch. Waiting for `mounted` (flipped in an effect, so it's `false`
  // on both the server render and the client's hydration render) keeps that
  // first render identical everywhere; the real auth check only kicks in on
  // the client-only re-render right after.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push('/login');
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return null;
  }

  return (
    <BreadcrumbProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* The content sits on its own rounded panel against the dark rail,
            the way the rest of the product's chrome is shaped. The gap is on
            the left only — top, right and bottom run to the window edge so
            long tables are not squeezed for the sake of symmetry. */}
        <SidebarInset className="bg-sidebar">
          <div className="flex min-h-svh flex-1 flex-col overflow-hidden rounded-l-2xl bg-background">
            <LicenseProvider>
              <Header />
              <LicenseExpiryBanner />
              <LicenseLockGate>
                <main className="flex-1 p-4 lg:p-6">{children}</main>
              </LicenseLockGate>
            </LicenseProvider>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
