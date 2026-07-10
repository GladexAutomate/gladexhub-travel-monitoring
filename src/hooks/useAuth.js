import { useCallback, useEffect, useState } from 'react';
import bcrypt from 'bcryptjs';
import { supabaseAccounts } from '@/lib/supabaseAccounts';

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

  const login = useCallback(async (identifier, password) => {
    const trimmed = identifier.trim();
    const { data, error } = await supabaseAccounts
      .from('admin_accounts')
      .select('id, full_name, email, employee_code, department, password_hash, role, team_name, is_active')
      .or(`email.eq.${trimmed},employee_code.eq.${trimmed}`)
      .limit(1);

    if (error) throw error;
    const account = data?.[0];
    if (!account) throw new Error('Invalid email/username or password.');

    const passwordOk = bcrypt.compareSync(password, account.password_hash);
    if (!passwordOk) throw new Error('Invalid email/username or password.');

    if (account.is_active === false) throw new Error('This account has been deactivated.');

    // Best-effort — a failed last_login stamp shouldn't block the login itself.
    supabaseAccounts
      .from('admin_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('id', account.id)
      .then(({ error: updateError }) => {
        if (updateError) console.error('Failed to update last_login', updateError);
      })
      .catch((updateError) => console.error('Failed to update last_login', updateError));

    const sessionUser = {
      name: account.full_name,
      email: account.email,
      employeeCode: account.employee_code,
      department: account.department,
      role: account.role,
      team: account.team_name,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return sessionUser;
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
