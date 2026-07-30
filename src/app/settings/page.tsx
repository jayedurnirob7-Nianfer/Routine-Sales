'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettings } from '@/lib/settings';
import { useRouter } from 'next/navigation';

const EMOJI_OPTIONS = ['⬡', '📋', '🏢', '⚡', '🎯', '🔷', '🌟', '💼', '📊', '🚀'];

export default function SettingsPage() {
  const { isAdmin, changePassword, changeUsername } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();

  const [siteName, setSiteName] = useState(settings.siteName);
  const [logoEmoji, setLogoEmoji] = useState(settings.logoEmoji);
  const [customEmoji, setCustomEmoji] = useState('');
  const [logoImage, setLogoImage] = useState(settings.logoImage ?? '');
  const [siteMsg, setSiteMsg]     = useState('');
  const [siteSaving, setSiteSaving] = useState(false);

  const [oldPass, setOldPass]     = useState('');
  const [newPass, setNewPass]     = useState('');
  const [confPass, setConfPass]   = useState('');
  const [passMsg, setPassMsg]     = useState('');

  const [newUser, setNewUser]     = useState('');
  const [userPass, setUserPass]   = useState('');
  const [userMsg, setUserMsg]     = useState('');

  const [migrationMsg, setMigrationMsg] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      router.push('/');
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  async function saveSite() {
    if (!siteName.trim()) { setSiteMsg('Site name cannot be empty.'); return; }
    setSiteSaving(true);
    await updateSettings({ siteName: siteName.trim(), logoEmoji: customEmoji || logoEmoji, logoImage });
    setSiteMsg('✅ Site settings saved!');
    setSiteSaving(false);
    setTimeout(() => setSiteMsg(''), 3000);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { setSiteMsg('❌ Image too large. Max 500KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setLogoImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function savePassword() {
    if (newPass !== confPass) { setPassMsg('❌ New passwords do not match.'); return; }
    if (newPass.length < 6)   { setPassMsg('❌ Password must be at least 6 characters.'); return; }
    const ok = await changePassword(oldPass, newPass);
    setPassMsg(ok ? '✅ Password changed successfully!' : '❌ Current password is incorrect.');
    if (ok) { setOldPass(''); setNewPass(''); setConfPass(''); }
    setTimeout(() => setPassMsg(''), 4000);
  }

  async function saveUsername() {
    if (!newUser.trim()) { setUserMsg('Username cannot be empty.'); return; }
    const ok = await changeUsername(newUser.trim(), userPass);
    setUserMsg(ok ? '✅ Username changed successfully!' : '❌ Current password is incorrect.');
    if (ok) { setNewUser(''); setUserPass(''); }
    setTimeout(() => setUserMsg(''), 4000);
  }

  async function handleMigration() {
    const conf = confirm('Are you sure you want to pull data from Google Sheets to MongoDB? This will overwrite the current database data.');
    if (!conf) return;
    
    setIsMigrating(true);
    setMigrationMsg('Migrating...');
    try {
      const res = await fetch('/api/migrate', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        setMigrationMsg('✅ Migration endpoint called successfully. Check server logs.');
      } else {
        setMigrationMsg('❌ Migration failed: ' + (json.message || 'Unknown error'));
      }
    } catch (e: any) {
      setMigrationMsg('❌ Error: ' + e.message);
    } finally {
      setIsMigrating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Site settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Site Settings</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Site Name</label>
          <input className="input" value={siteName} onChange={e => setSiteName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Logo Emoji</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => { setLogoEmoji(e); setCustomEmoji(''); }}
                className={`w-10 h-10 rounded-xl text-xl border-2 transition-all
                  ${(customEmoji || logoEmoji) === e ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                {e}
              </button>
            ))}
          </div>
          <input className="input w-32" placeholder="Custom emoji" value={customEmoji}
            onChange={e => setCustomEmoji(e.target.value)} maxLength={2} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Logo Image (optional, max 500KB)</label>
          <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-sm" />
          {logoImage && <img src={logoImage} alt="logo preview" className="mt-2 h-10 w-10 rounded-xl object-cover" />}
        </div>
        {siteMsg && <p className="text-sm">{siteMsg}</p>}
        <button className="btn-primary" onClick={saveSite} disabled={siteSaving}>
          {siteSaving ? 'Saving…' : 'Save Site Settings'}
        </button>
      </div>

      {/* Change password */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Change Password</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Current Password</label>
          <input className="input" type="password" value={oldPass} onChange={e => setOldPass(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">New Password</label>
          <input className="input" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirm New Password</label>
          <input className="input" type="password" value={confPass} onChange={e => setConfPass(e.target.value)} />
        </div>
        {passMsg && <p className="text-sm">{passMsg}</p>}
        <button className="btn-primary" onClick={savePassword}>Change Password</button>
      </div>

      {/* Change username */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Change Username</h2>
        <div>
          <label className="block text-sm font-medium mb-1">New Username</label>
          <input className="input" value={newUser} onChange={e => setNewUser(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Current Password (to confirm)</label>
          <input className="input" type="password" value={userPass} onChange={e => setUserPass(e.target.value)} />
        </div>
        {userMsg && <p className="text-sm">{userMsg}</p>}
        <button className="btn-primary" onClick={saveUsername}>Change Username</button>
      </div>

      {/* Migration */}
      <div className="card p-6 space-y-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20">
        <h2 className="font-semibold text-lg text-amber-800 dark:text-amber-500">Database Migration</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Use this button to fetch data from the old Google Sheets backend and seed the new MongoDB database.
        </p>
        {migrationMsg && <p className="text-sm font-semibold">{migrationMsg}</p>}
        <button className="btn-primary bg-amber-600 hover:bg-amber-700 text-white border-none" onClick={handleMigration} disabled={isMigrating}>
          {isMigrating ? 'Migrating...' : 'Migrate from Google Sheets'}
        </button>
      </div>
    </div>
  );
}
