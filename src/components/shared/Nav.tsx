'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settings';
import { useState, useEffect } from 'react';

const links = [
  { href: '/',           label: 'Dashboard' },
  { href: '/roster',     label: 'Shift Roster' },
  { href: '/employees',  label: 'Employees' },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { isAdmin, employeeUser, logout } = useAuth();
  const { settings } = useSettings();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pxl_dark');
    const prefersDark = saved ? saved === '1' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('pxl_dark', next ? '1' : '0');
  }

  let allLinks: {href: string, label: string}[] = [];
  if (isAdmin) {
    allLinks = [...links, { href: '/settings', label: 'Settings' }];
  } else if (employeeUser) {
    allLinks = [{ href: '/my-schedule', label: 'My Schedule' }];
  } else {
    // If neither logged in, maybe show Dashboard if it's public? 
    // The prompt didn't say Dashboard is private. Actually it is private now? 
    // Usually Dashboard was public for everyone to view. We'll leave it as `links`.
    allLinks = links; 
  }

  const [showLoginPop, setShowLoginPop] = useState(false);
  const [loginType, setLoginType] = useState<'employee' | 'admin'>('employee');
  const [loginU, setLoginU] = useState('');
  const [loginP, setLoginP] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const { loginAsEmployee, login } = useAuth(); // getting login functions

  useEffect(() => {
    setShowLoginPop(false);
    setLoginU('');
    setLoginP('');
    setLoginErr('');
  }, [pathname]);

  async function handleLogin() {
    setLoginLoading(true);
    setLoginErr('');
    let ok = false;
    if (loginType === 'admin') {
      ok = await login(loginU, loginP);
    } else {
      ok = await loginAsEmployee(loginU, loginP);
    }
    
    if (ok) {
      setShowLoginPop(false);
      if (loginType === 'employee') router.push('/my-schedule');
      if (loginType === 'admin') router.push('/');
    } else {
      setLoginErr('Invalid credentials');
      setLoginLoading(false);
    }
  }

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14 relative">
        <Link href="/" className="font-bold text-teal-600 text-lg tracking-tight flex items-center gap-2">
          {settings.logoImage
            ? <img src={settings.logoImage} alt="logo" className="w-7 h-7 rounded object-cover" />
            : <span className="text-xl">{settings.logoEmoji}</span>
          }
          <span className="truncate max-w-[200px] sm:max-w-none">{settings.siteName}</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {allLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors
                ${pathname === l.href
                  ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleDark} className="btn-ghost text-lg" title="Toggle theme">{dark ? '☀️' : '🌙'}</button>
          
          {isAdmin || employeeUser ? (
            <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-500 btn-ghost">Sign Out</button>
          ) : (
            <div className="relative">
              <button 
                onClick={() => setShowLoginPop(!showLoginPop)} 
                className="btn-primary text-sm px-4 py-1.5 shadow-sm transition-transform active:scale-95 flex items-center gap-2"
              >
                🔐 Login
              </button>
              
              {showLoginPop && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLoginPop(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-[300px] card p-5 shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-50 animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
                    
                    {/* Tabs */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-4">
                      <button 
                        className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-all ${loginType === 'employee' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        onClick={() => { setLoginType('employee'); setLoginU(''); setLoginP(''); setLoginErr(''); }}
                      >
                        Employee
                      </button>
                      <button 
                        className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-all ${loginType === 'admin' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600 dark:text-teal-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        onClick={() => { setLoginType('admin'); setLoginU(''); setLoginP(''); setLoginErr(''); }}
                      >
                        Admin
                      </button>
                    </div>

                    <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                      {loginType === 'admin' ? <span>🔐 Admin Login</span> : <span>👋 Employee Login</span>}
                    </h3>
                    
                    {loginErr && <div className="text-red-500 text-xs mb-3 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/30">{loginErr}</div>}
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500">{loginType === 'admin' ? 'Username' : 'Employee ID'}</label>
                        <input type="text" placeholder={loginType === 'admin' ? 'admin' : 'EMP-001'} className="input text-sm py-1.5" value={loginU} onChange={e => setLoginU(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-gray-500">Password</label>
                        <input type="password" placeholder="••••••••" className="input text-sm py-1.5" value={loginP} onChange={e => setLoginP(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                      </div>
                      <button className="btn-primary w-full text-sm py-2 mt-1 shadow-sm" onClick={handleLogin} disabled={loginLoading}>
                        {loginLoading ? 'Authenticating...' : 'Sign In'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <button className="md:hidden btn-ghost" onClick={() => setOpen(!open)}>☰</button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 px-4 py-2 flex flex-col gap-1">
          {allLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-xl text-sm font-medium ${pathname === l.href ? 'bg-teal-50 text-teal-600' : 'text-gray-700 dark:text-gray-300'}`}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
