import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, tokenStore } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until the first /auth/me settles

  // On mount, if a token is stored, hydrate the user (validates the token too).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await apiFetch('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: loggedIn } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    tokenStore.set(token);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
