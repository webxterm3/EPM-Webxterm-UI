'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getLicenseStatus, LicenseStatus } from '@/lib/license-api';

interface LicenseContextValue {
  license: LicenseStatus | null;
  loading: boolean;
  refresh: () => void;
}

const LicenseContext = createContext<LicenseContextValue>({
  license: null,
  loading: true,
  refresh: () => {},
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getLicenseStatus(token);
      setLicense(data);
    } catch {
      // silently fail — components handle null
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <LicenseContext.Provider value={{ license, loading, refresh: fetch }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
