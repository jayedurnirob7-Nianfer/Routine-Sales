'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settings';

export default function LoginPage() {
  const { login, isAdmin } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      router.push('/');
    }
  }, [isAdmin, router]);

  if (isAdmin) { return null; }

  async function handleSubmit() {
    setLoading(true);
    setErr('');
    const ok = await login(u, p);
    if (ok) {
      router.push('/'); 
    }
    else { setErr('Invalid username or password.'); setLoading(false); }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card p-8 w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">{settings.logoEmoji}</div>
          <h1 className="text-xl font-bold">{settings.siteName}</h1>
          <p className="text-gray-500 text-sm mt-1">Admin Login</p>
        </div>
        {err && <p className="text-red-500 text-sm bg-red-50 dark:bg-red-950 px-3 py-2 rounded-xl">{err}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input className="input" type="text" autoComplete="username" placeholder="Enter username" value={u} onChange={e => setU(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input className="input" type="password" autoComplete="current-password" placeholder="••••••••" value={p}
              onChange={e => setP(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
        </div>
        <button className="btn-primary w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}
