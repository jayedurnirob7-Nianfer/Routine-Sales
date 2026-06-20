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

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
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
          {isAdmin || employeeUser
            ? <button onClick={() => { logout(); router.push('/'); }} className="text-sm text-red-500 btn-ghost">Sign Out</button>
            : <Link href="/login" className="btn-primary">Login</Link>}
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
