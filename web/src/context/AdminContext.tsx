import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth.js';

interface AdminContextValue {
  isAdmin: boolean;
  loading: boolean;
  login: (password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .getSession()
      .then((s) => setIsAdmin(s.isAdmin))
      .finally(() => setLoading(false));
  }, []);

  async function login(password: string, name?: string) {
    await authApi.login(password, name);
    setIsAdmin(true);
  }

  async function logout() {
    await authApi.logout();
    setIsAdmin(false);
  }

  return <AdminContext.Provider value={{ isAdmin, loading, login, logout }}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
