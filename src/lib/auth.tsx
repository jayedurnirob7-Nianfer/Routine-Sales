'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAdminCreds, saveAdminCreds } from '@/lib/store';
import { AdminCredentials } from '@/types';

const SESSION_KEY = 'pxl_session';

interface AuthCtx {
  isAdmin: boolean;
  isLoading: boolean;
  login(u: string, p: string): Promise<boolean>;
  logout(): void;
  changePassword(oldPass: string, newPass: string): Promise<boolean>;
  changeUsername(newUser: string, currentPass: string): Promise<boolean>;
}
const Ctx = createContext<AuthCtx>({
  isAdmin: false, isLoading: true,
  login: async () => false, logout: () => {},
  changePassword: async () => false, changeUsername: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(SESSION_KEY) === '1');
    setIsLoading(false);
  }, []);

  async function login(u: string, p: string) {
    const creds = await getAdminCreds();
    if (u === creds.username && p === creds.password) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setIsAdmin(true);
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAdmin(false);
  }

  async function changePassword(oldPass: string, newPass: string): Promise<boolean> {
    const creds = await getAdminCreds();
    if (oldPass !== creds.password) return false;
    await saveAdminCreds({ ...creds, password: newPass });
    return true;
  }

  async function changeUsername(newUser: string, currentPass: string): Promise<boolean> {
    const creds = await getAdminCreds();
    if (currentPass !== creds.password) return false;
    await saveAdminCreds({ ...creds, username: newUser });
    return true;
  }

  return <Ctx.Provider value={{ isAdmin, isLoading, login, logout, changePassword, changeUsername }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
