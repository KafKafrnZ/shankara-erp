import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAsOf, fetchMe, login as loginApi, logout as logoutApi } from '../lib/api.ts';
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
      // No local flag says whether a cookie exists — it's httpOnly on
      // purpose (see AuthController.login), so this just asks the server
      // and treats a 401 the same as "not logged in."
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
    // loginApi's response already set the auth cookie — nothing for this
    // code to store.
    await loginApi(email, password);
    const me = await fetchMe();
    setUser(me);
    await refreshAsOf();
  }, [refreshAsOf]);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* logoutApi clears the cookie server-side; a failed request here
       * just means the client didn't get to see that happen — still
       * safe to clear local state either way. */
    }
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
