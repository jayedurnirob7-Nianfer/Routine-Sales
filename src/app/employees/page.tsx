'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, getRoster, saveRoster, getActiveLeave, SHIFT_INFO, todayKey, invalidateCache, getNightShiftProgress, getAssignment } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import ShiftBadge from '@/components/shared/ShiftBadge';
import AssignShiftModal from '@/components/shared/AssignShiftModal';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@/components/shared/Dialogs';

function Avatar({ emp, className = '' }: { emp: Employee, className?: string }) {
  if (emp.profileImage) {
    return <img src={emp.profileImage} alt={emp.name} className={`object-cover ${className}`} />;
  }
  return <div className={`flex items-center justify-center font-bold ${className}`}>{emp.name.charAt(0)}</div>;
}

export default function EmployeesPage() {
  const { isAdmin, loginAsEmployee, employeeUser } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Employee | null>(null);
  const [isAdding, setIsAdding]   = useState(false);
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [saving, setSaving]       = useState(false);

  // ✅ New Profile Image field added to the form
  const blank = () => ({ name: '', employeeId: '', role: '', defaultShift: 'morning' as ShiftType, profileImage: '', password: '' });
  const [form, setForm] = useState(blank());

  const [leaveModal, setLeaveModal] = useState<{ emp: Employee } | null>(null);
  const [leaveForm, setLeaveForm]   = useState({ fromDate: todayKey(), toDate: todayKey(), reason: '' });
  const [assignTarget, setAssignTarget] = useState<{ emp: Employee; date: string } | null>(null);

  const [loginModal, setLoginModal] = useState<{ emp: Employee } | null>(null);
  const [loginPass, setLoginPass]   = useState('');
  const [loginErr, setLoginErr]     = useState('');

  // Global Dialog States
  const [alertConfig, setAlertConfig] = useState<{ open: boolean; title?: string; message: string; type?: 'error'|'warning' }>({ open: false, message: '' });
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean; title: string; message: string; isDestructive?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [promptConfig, setPromptConfig] = useState<{ open: boolean; title: string; message: string; type?: 'text'|'password'; onConfirm: (v: string) => void }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    if (forceRefresh) invalidateCache();
    try {
      const [emps, ros] = await Promise.all([getEmployees(), getRoster()]);
      setEmployees(emps);
      setRoster(ros);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Failed to load from Google Sheets: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (employees.length > 0 && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      if (id && !selected) {
        const emp = employees.find(e => e.id === id);
        if (emp) setSelected(emp);
        
        // Remove the query string so it doesn't persist on refresh
        window.history.replaceState(null, '', '/employees');
      }
    }
  }, [employees, selected]);

  const filtered = employees.filter(e => search === '' || e.name.toLowerCase().includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase()));

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({ name: emp.name, employeeId: emp.employeeId, role: emp.role, defaultShift: emp.defaultShift || 'morning', profileImage: emp.profileImage || '', password: emp.password || '' });
    setIsAdding(true);
  }

  async function save() {
    if (!form.name || !form.employeeId || !form.role) return setAlertConfig({ open: true, message: 'Fill required fields' });
    setSaving(true);
    try {
      let updated: Employee[];
      if (editing) {
        updated = employees.map(e => e.id === editing.id ? { ...editing, ...form } : e);
      } else {
        updated = [...employees, { id: Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], active: true, ...form }];
      }
      await saveEmployees(updated);
      setEmployees(updated);
      if (editing && selected?.id === editing.id) {
        setSelected(updated.find(e => e.id === editing.id) || null);
      }
      setIsAdding(false);
      setEditing(null);
    } catch (e: unknown) {
      setAlertConfig({ open: true, message: `Save failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    setConfirmConfig({
      open: true,
      title: 'Remove Employee',
      message: 'Are you sure you want to completely remove this employee?',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(p => ({ ...p, open: false }));
        setSaving(true);
        try {
          const updated = employees.filter(e => e.id !== id);
          await saveEmployees(updated);
          setEmployees(updated);
          if (selected?.id === id) setSelected(null);
        } catch (e: unknown) {
          setAlertConfig({ open: true, message: `Remove failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
        } finally {
          setSaving(false);
        }
      }
    });
  }

  async function saveLeave() {
    if (!leaveModal) return;
    setSaving(true);
    try {
      let next = { ...roster };
      const start = new Date(leaveForm.fromDate + 'T00:00:00');
      const end = new Date(leaveForm.toDate + 'T00:00:00');
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const others = (next[dateStr] ?? []).filter(a => a.employeeId !== leaveModal.emp.id && a.employeeId !== leaveModal.emp.employeeId);
        next[dateStr] = [...others, {
          employeeId: leaveModal.emp.id,
          shift: 'off',
          effectiveFrom: dateStr,
          effectiveTo: dateStr,
          reason: `LEAVE|${leaveForm.fromDate}|${leaveForm.toDate}|${leaveForm.reason}`,
          isOffDayOverride: true,
        }];
      }
      await saveRoster(next);
      setRoster(next);
      setLeaveModal(null);
    } catch (e: unknown) {
      setAlertConfig({ open: true, message: `Failed to save leave: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  }

  function removeLeave(leave: { employeeId: string, fromDate: string, toDate: string }) {
    setConfirmConfig({
      open: true,
      title: 'Cancel Leave',
      message: 'Are you sure you want to cancel this leave?',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(p => ({ ...p, open: false }));
        setSaving(true);
        try {
          let next = { ...roster };
          const start = new Date(leave.fromDate + 'T00:00:00');
          const end = new Date(leave.toDate + 'T00:00:00');
          
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const updatedList = (next[date] ?? []).filter(a =>
              !( (a.employeeId === leave.employeeId || a.employeeId === selected?.employeeId) && a.reason?.startsWith('LEAVE|') )
            );
            next[date] = updatedList;
          }
          await saveRoster(next);
          setRoster(next);
        } catch (e: unknown) {
          setAlertConfig({ open: true, message: `Failed to cancel leave: ${e instanceof Error ? e.message : 'Unknown error'}` });
        } finally {
          setSaving(false);
        }
      }
    });
  }

  async function changeEmployeePassword(id: string, newPass: string) {
    setSaving(true);
    try {
      const emps = await getEmployees();
      const idx = emps.findIndex(e => e.id === id);
      if (idx > -1) {
        emps[idx].password = newPass;
        await saveEmployees(emps);
        setEmployees(emps);
        if (selected?.id === id) {
          setSelected(emps[idx]);
        }
      }
    } catch (e: unknown) {
      setAlertConfig({ open: true, message: `Failed to update password: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleEmployeeLogin() {
    if (!loginModal) return;
    setSaving(true);
    setLoginErr('');
    const ok = await loginAsEmployee(loginModal.emp.employeeId, loginPass);
    if (ok) {
      router.push('/my-schedule');
    } else {
      setLoginErr('Incorrect password');
      setSaving(false);
    }
  }

  const currentMonthSchedule = selected ? (() => {
    const todayStr = todayKey();
    const [yyyy, mm] = todayStr.split('-');
    const year = parseInt(yyyy, 10);
    const month = parseInt(mm, 10) - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const schedule = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const a = getAssignment(roster, selected, dateStr);
      schedule.push({ date: dateStr, assignment: a });
    }
    return schedule;
  })() : [];

  const nightProgress = selected ? getNightShiftProgress(roster, selected) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-400 text-sm">Loading from Google Sheets…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-500 font-medium">Could not load data</p>
          <p className="text-gray-400 text-sm">{error}</p>
          <button onClick={() => load(true)} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  if (isAdding) {
    return (
      <div className="flex justify-center">
        <div className="card p-6 w-full max-w-md space-y-4">
          <h2 className="font-semibold text-lg">{editing ? 'Edit Employee' : 'Add Employee'}</h2>
          {(['name', 'employeeId', 'role'] as const).map(field => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1">{field === 'employeeId' ? 'Employee ID' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
              <input className="input" value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">Default Shift</label>
            <select className="input" value={form.defaultShift} onChange={e => setForm({ ...form, defaultShift: e.target.value as ShiftType })}>
              {Object.keys(SHIFT_INFO).filter(k => k !== 'off').map(s => (
                <option key={s} value={s}>{SHIFT_INFO[s as ShiftType].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Profile Image URL (Optional)</label>
            <input className="input" placeholder="https://imgur.com/... or Google Drive link" value={form.profileImage} onChange={e => setForm({ ...form, profileImage: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">Paste a link to an image or GIF from ImgBB, Imgur, or Google Drive.</p>
          </div>
          <div className="flex gap-2 pt-4">
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="btn-ghost flex-1 border border-gray-200 dark:border-gray-700" onClick={() => { setIsAdding(false); setEditing(null); }} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const detailsPanel = selected ? (
    <div className="space-y-6 flex flex-col pt-2 pb-6">
      <div className="card p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-t-4 border-t-teal-500 shadow-sm">
        <div className="flex items-center gap-4">
          {/* ✅ Avatar added here */}
          <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 text-2xl font-bold border-2 border-white dark:border-gray-800 shadow-md overflow-hidden shrink-0">
             <Avatar emp={selected} className="w-full h-full" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{selected.name}</h2>
              {!isAdmin && employeeUser?.id !== selected.id && (
                <button className="btn-primary py-1 px-3 text-xs shadow-sm bg-teal-600 hover:bg-teal-700 border-none" onClick={() => { setLoginPass(''); setLoginErr(''); setLoginModal({ emp: selected }); }}>
                  🔒 Login
                </button>
              )}
            </div>
            <div className="text-gray-500 mt-1 flex items-center gap-2">
              <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs font-medium">ID: {selected.employeeId}</span>
              <span>·</span>
              <span className="text-sm">{selected.role.split('|IMG:')[0]}</span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm" onClick={() => openEdit(selected)}>✎ Edit</button>
            <button className="btn-ghost text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm" onClick={() => remove(selected.id)}>🗑 Remove</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="text-lg">✈️</span> Leave Status</h3>
            {isAdmin && (
              <button className="btn-ghost text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-3 py-1.5 rounded-lg font-medium" onClick={() => setLeaveModal({ emp: selected })}>
                + Register Leave
              </button>
            )}
          </div>
          {(() => {
            const activeLeave = getActiveLeave(roster, selected);
            if (!activeLeave) return <p className="text-gray-400 text-sm italic bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl text-center">No upcoming or active leave.</p>;
            return (
              <div className="bg-amber-50/50 dark:bg-amber-900/10 p-5 rounded-xl border border-amber-100 dark:border-amber-900/30">
                <div className="font-semibold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-2">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span></span>
                  Currently on Leave
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-500/80 mb-3">
                  {new Date(activeLeave.fromDate + 'T00:00:00').toLocaleDateString()} — {new Date(activeLeave.toDate + 'T00:00:00').toLocaleDateString()}
                  {activeLeave.reason && ` · ${activeLeave.reason}`}
                </div>
                {isAdmin && (
                  <button className="btn-primary bg-red-500 hover:bg-red-600 border-none shadow-sm text-xs px-4" onClick={() => removeLeave(activeLeave)} disabled={saving}>
                    {saving ? 'Canceling...' : 'Cancel Leave'}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="text-lg">🌙</span> Night Shift Tracker</h3>
          </div>
          {nightProgress && nightProgress.total > 0 ? (
            <div className="space-y-4">
              <div className="text-xs text-gray-400">
                {new Date(nightProgress.year, nightProgress.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-3xl font-black text-purple-600 tracking-tight">{nightProgress.completed} <span className="text-lg font-medium text-gray-400 tracking-normal">/ {nightProgress.total}</span></div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">Completed Nights</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-500">{nightProgress.remaining}</div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">Remaining</div>
                </div>
              </div>
              <div className="relative pt-1">
                <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-purple-100 dark:bg-gray-800 inset-shadow-sm">
                  <div style={{ width: `${(nightProgress.completed / nightProgress.total) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 min-h-[120px]">
              <span className="text-gray-400 text-sm font-medium italic">No night shifts this month</span>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm mt-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-lg">📅</span> 
            {new Date(todayKey() + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Schedule
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
          {currentMonthSchedule.map(({ date, assignment }) => {
            const isToday = date === todayKey();
            return (
              <div key={date} className={`p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer
                ${isToday ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800/50 shadow-sm ring-1 ring-teal-500/20' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-teal-300'}`}
                onClick={() => isAdmin && setAssignTarget({ emp: selected, date })}>
                <div className={`text-[10px] uppercase font-bold tracking-wider mb-0.5 ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })} {isToday && '(TODAY)'}
                </div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                {assignment ? <ShiftBadge shift={assignment.shift} isLeave={assignment.reason?.startsWith('LEAVE|')} /> : <div className="text-xs text-gray-400 italic">Not assigned</div>}
              </div>
            );
          })}
        </div>
      </div>

      {selected.requests && Object.values(selected.requests).filter(r => r.status !== 'pending').length > 0 && (
        <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="text-lg">🗂️</span> Request History
            </h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {Object.values(selected.requests)
              .filter(r => r.status !== 'pending')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((req, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl flex items-center justify-between border border-gray-100 dark:border-gray-700">
                  <div>
                    <div className="font-semibold text-sm">
                      {req.type === 'leave' ? `Leave Request` : req.type === 'off' ? `Off Day Request` : `Shift Switch (${SHIFT_INFO[req.requestedShift!]?.label})`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Requested for: <strong>{req.date}</strong></div>
                    {req.reason && <div className="text-xs text-gray-500 mt-0.5">Reason: {req.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {req.status === 'approved' && <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">Approved</span>}
                    {req.status === 'rejected' && <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">Rejected</span>}
                  </div>
                </div>
            ))}
          </div>
        </div>
      )}

      {/* 🔐 Admin Security Panel */}
      {isAdmin && (
        <div className="card p-6 border border-red-100 dark:border-red-900/30 shadow-sm mt-4 bg-red-50/30 dark:bg-red-900/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="text-lg">🔐</span> Security & Access
            </h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <div className="text-sm font-medium text-gray-500 mb-1">Current Password</div>
              <div className="font-mono text-lg font-bold tracking-widest text-gray-900 dark:text-gray-100">
                {selected.password || <span className="text-gray-400 italic font-sans text-sm tracking-normal">Not set (Uses default '1234')</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <button 
                className="btn-ghost flex-1 sm:flex-none border border-gray-200 dark:border-gray-700 text-xs py-1.5"
                disabled={saving}
                onClick={() => {
                  setPromptConfig({
                    open: true,
                    title: 'Change Password',
                    message: `Enter new password for ${selected.name}`,
                    type: 'text',
                    onConfirm: (val) => {
                      setPromptConfig(p => ({ ...p, open: false }));
                      if (val) changeEmployeePassword(selected.id, val);
                    }
                  });
                }}
              >
                Change
              </button>
              {selected.password && (
                <button 
                  className="btn-ghost flex-1 sm:flex-none text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 text-xs py-1.5"
                  disabled={saving}
                  onClick={() => {
                    setConfirmConfig({
                      open: true,
                      title: 'Remove Password',
                      message: `Remove password? They will login with default '1234'.`,
                      isDestructive: true,
                      onConfirm: () => {
                        setConfirmConfig(p => ({ ...p, open: false }));
                        changeEmployeePassword(selected.id, '');
                      }
                    });
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  ) : null;

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-6rem)]">
      {/* Left List */}
      <div className={`w-full md:w-80 flex-col gap-4 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Team</h1>
          {isAdmin && <button className="btn-primary text-xs py-1.5" onClick={() => { setForm(blank()); setIsAdding(true); }}>+ Add</button>}
        </div>
        <div className="flex items-center gap-2">
          <input className="input flex-1" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700 px-3" onClick={() => load(true)} title="Refresh">↻</button>
        </div>
        <div className="card flex-1 overflow-auto p-2 space-y-1">
          {filtered.length === 0 && <p className="text-gray-400 text-sm text-center mt-4">No employees found.</p>}
          {filtered.map(emp => (
            <div key={emp.id} className="space-y-2 mb-1">
              <button onClick={() => setSelected(selected?.id === emp.id ? null : emp)} className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${selected?.id === emp.id ? 'bg-teal-50 dark:bg-teal-900/30 ring-1 ring-teal-500/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                {/* ✅ Avatar added here */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-bold overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700">
                    <Avatar emp={emp} className="w-full h-full text-[10px]" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{emp.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{emp.employeeId} · {emp.role.split('|IMG:')[0]}</div>
                  </div>
                </div>
                <div className={`text-gray-400 text-lg transition-transform duration-200 ${selected?.id === emp.id ? 'rotate-90 text-teal-500' : ''}`}>›</div>
              </button>
            </div>
          ))}
        </div>

      </div>

      <div className={`flex-1 min-w-0 flex-col overflow-auto md:pr-2 ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <>
            <button className="md:hidden mb-4 text-teal-600 font-medium flex items-center gap-1 self-start" onClick={() => setSelected(null)}>
              ← Back to list
            </button>
            {detailsPanel}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 card border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="text-5xl mb-4 opacity-50 grayscale">👤</div>
            <p className="text-lg font-medium text-gray-500">Select an employee to view details</p>
          </div>
        )}
      </div>

      {leaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="card p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-5 flex items-center gap-2">✈️ Register Leave</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">From Date</label>
                <input type="date" className="input" value={leaveForm.fromDate} onChange={e => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">To Date</label>
                <input type="date" className="input" value={leaveForm.toDate} onChange={e => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Reason (Optional)</label>
                <input type="text" className="input" placeholder="e.g. Sick leave, vacation" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button className="btn-primary flex-1 shadow-sm" onClick={saveLeave} disabled={saving}>{saving ? 'Saving...' : 'Confirm'}</button>
              <button className="btn-ghost flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" onClick={() => setLeaveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="card p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">🔒 Login as {loginModal.emp.name}</h2>
            <p className="text-sm text-gray-500 mb-5">Enter password to access schedule & requests.</p>
            {loginErr && <div className="bg-red-50 text-red-600 text-sm p-2 rounded mb-4">{loginErr}</div>}
            <div className="space-y-4">
              <div className="hidden">
                <input type="text" autoComplete="username" value={loginModal.emp.employeeId} readOnly />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <input type="password" autoComplete="current-password" autoFocus className="input" placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmployeeLogin()} />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button className="btn-primary flex-1 shadow-sm" onClick={handleEmployeeLogin} disabled={saving}>{saving ? 'Signing in...' : 'Login'}</button>
              <button className="btn-ghost flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" onClick={() => setLoginModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <AssignShiftModal
          employee={assignTarget.emp}
          date={assignTarget.date}
          currentShift={getAssignment(roster, assignTarget.emp, assignTarget.date)?.shift}
          roster={roster}
          onSave={(newRoster) => { setRoster(newRoster); }}
          onClose={() => setAssignTarget(null)}
        />
      )}

      <AlertDialog {...alertConfig} onClose={() => setAlertConfig(p => ({ ...p, open: false }))} />
      <ConfirmDialog {...confirmConfig} onCancel={() => setConfirmConfig(p => ({ ...p, open: false }))} />
      <PromptDialog {...promptConfig} onCancel={() => setPromptConfig(p => ({ ...p, open: false }))} />
    </div>
  );
}
