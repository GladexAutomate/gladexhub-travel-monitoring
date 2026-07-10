import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'gladex_flight_tracker_user';

// 'super_admin' behaves like 'admin' (full access, team/agent filters) — the
// distinct label just marks the boss/owner-level account (e.g. ADM001) that
// also gets access to the developer-only debug panel and the Accounts page.
export const ADMIN_LIKE_ROLES = ['admin', 'super_admin'];

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState(readStoredUser);

  useEffect(() => {
    // Keep in sync if another tab logs in/out.
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setUser(readStoredUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Background session validation — every 5 minutes, check if the user is
  // still an active employee in the synced cache. If deactivated or removed,
  // log them out silently. No page refresh — runs entirely in the background.
  useEffect(() => {
    if (!user?.email) return;

    const checkSession = async () => {
      try {
        const response = await base44.functions.invoke('validateSession', {
          email: user.email,
        });
        if (response.data?.valid === false) {
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
          window.location.href = '/admin/flight-tracker-login';
        }
      } catch {
        // Network errors shouldn't log the user out.
      }
    };

    const interval = setInterval(checkSession, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.email]);

  const login = useCallback(async (identifier, password) => {
    try {
      const response = await base44.functions.invoke('employeeLogin', {
        identifier: identifier.trim(),
        password,
      });
      const sessionUser = response.data?.user;
      if (!sessionUser) throw new Error('Invalid email/username or password.');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
      setUser(sessionUser);
      return sessionUser;
    } catch (err) {
      throw new Error(
        err.response?.data?.error || err.message || 'Invalid email/username or password.'
      );
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isAdminLike: !!user && ADMIN_LIKE_ROLES.includes(user.role),
    login,
    logout,
  };
}