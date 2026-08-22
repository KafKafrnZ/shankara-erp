import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAsOf, fetchMe, login as loginApi, logout as logoutApi, TOKEN_KEY } from '../lib/api.ts';
import { clearHowToDismissed } from '../lib/howto.ts';
import type { User } from '../lib/types.ts';
import { AuthContext } from './context.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAsOf = useCallback(async () => {
    try {
      const meta = await fetchAsOf();
      setAsOf(meta.asOf);
    } catch {
      /* as-of is best-effort; 401 handled in api.ts */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        const meta = await fetchAsOf();
        if (!cancelled) setAsOf(meta.asOf);
      } catch {
        if (!cancelled) {
          setUser(null);
          setAsOf(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginApi(email, password);
    sessionStorage.setItem(TOKEN_KEY, res.accessToken);
    const me = await fetchMe();
    setUser(me);
    await refreshAsOf();
  }, [refreshAsOf]);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* still clear locally */
    }
    sessionStorage.removeItem(TOKEN_KEY);
    clearHowToDismissed();
    setUser(null);
    setAsOf(null);
  }, []);

  const value = useMemo(
    () => ({ user, asOf, loading, login, logout, refreshAsOf }),
    [user, asOf, loading, login, logout, refreshAsOf],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
