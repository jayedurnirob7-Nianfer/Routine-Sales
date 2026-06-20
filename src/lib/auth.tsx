'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAdminCreds, saveAdminCreds, getEmployees } from '@/lib/store';
import { AdminCredentials, Employee } from '@/types';

const SESSION_KEY = 'pxl_session';
const EMP_SESSION_KEY = 'pxl_emp_session';

interface AuthCtx {
  isAdmin: boolean;
  employeeUser: Employee | null;
  isLoading: boolean;
  login(u: string, p: string): Promise<boolean>;
  loginAsEmployee(empId: string, p: string): Promise<boolean>;
  logout(): void;
  changePassword(oldPass: string, newPass: string): Promise<boolean>;
  changeUsername(newUser: string, currentPass: string): Promise<boolean>;
}

const Ctx = createContext<AuthCtx>({
  isAdmin: false, employeeUser: null, isLoading: true,
  login: async () => false, loginAsEmployee: async () => false, logout: () => {},
  changePassword: async () => false, changeUsername: async () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeUser, setEmployeeUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        setIsAdmin(true);
      } else {
        const empId = sessionStorage.getItem(EMP_SESSION_KEY);
        if (empId) {
          try {
            const emps = await getEmployees();
            const emp = emps.find(e => e.id === empId);
            if (emp) setEmployeeUser(emp);
          } catch {}
        }
      }
      setIsLoading(false);
    }
    loadSession();
  }, []);

  async function login(u: string, p: string) {
    const creds = await getAdminCreds();
    if (u === creds.username && p === creds.password) {
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.removeItem(EMP_SESSION_KEY);
      setIsAdmin(true);
      setEmployeeUser(null);
      return true;
    }
    return false;
  }

  async function loginAsEmployee(empId: string, p: string) {
    const emps = await getEmployees();
    const emp = emps.find(e => e.id === empId && (e.password === p || (!e.password && p === '1234')));
    if (emp) {
      sessionStorage.setItem(EMP_SESSION_KEY, emp.id);
      sessionStorage.removeItem(SESSION_KEY);
      setIsAdmin(false);
      setEmployeeUser(emp);
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(EMP_SESSION_KEY);
    setIsAdmin(false);
    setEmployeeUser(null);
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

  return <Ctx.Provider value={{ isAdmin, employeeUser, isLoading, login, loginAsEmployee, logout, changePassword, changeUsername }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
