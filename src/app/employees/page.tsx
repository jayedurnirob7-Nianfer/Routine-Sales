'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, getRoster, saveRoster, getActiveLeave, SHIFT_INFO, todayKey, invalidateCache, getNightShiftProgress, getAssignment } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import ShiftBadge from '@/components/shared/ShiftBadge';
import AssignShiftModal from '@/components/shared/AssignShiftModal';

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Employee | null>(null);
  const [isAdding, setIsAdding]   = useState(false);
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [saving, setSaving]       = useState(false);

  const blank = () => ({ name: '', employeeId: '', role: '', defaultShift: 'morning' as ShiftType });
  const [form, setForm] = useState(blank());

  const [leaveModal, setLeaveModal] = useState<{ emp: Employee } | null>(null);
  const [leaveForm, setLeaveForm]   = useState({ fromDate: todayKey(), toDate: todayKey(), reason: '' });
  const [assignTarget, setAssignTarget] = useState<{ emp: Employee; date: string } | null>(null);

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

  const filtered = employees.filter(e => search === '' || e.name.toLowerCase().includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase()));

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({ name: emp.name, employeeId: emp.employeeId, role: emp.role, defaultShift: emp.defaultShift || 'morning' });
    setIsAdding(true);
  }

  async function save() {
    if (!form.name || !form.employeeId || !form.role) return alert('Fill required fields');
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
      alert(`Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Are you sure you want to completely remove this employee?')) return;
    setSaving(true);
    try {
      const updated = employees.filter(e => e.id !== id);
      await saveEmployees(updated);
      setEmployees(updated);
      if (selected?.id === id) setSelected(null);
    } catch (e: unknown) {
      alert(`Remove failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
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
      alert(`Failed to save leave: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeLeave(leave: { employeeId: string, fromDate: string, toDate: string }) {
    if (!confirm('Cancel this leave?')) return;
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
      alert(`Failed to cancel leave: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
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
          <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 text-2xl font-bold border-2 border-white dark:border-gray-800 shadow-md">
            {selected.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{selected.name}</h2>
            <div className="text-gray-500 mt-1 flex items-center gap-2">
              <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs font-medium">ID: {selected.employeeId}</span>
              <span>·</span>
              <span className="text-sm">{selected.role}</span>
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

        {/* --- NIGHT SHIFT TRACKER --- */}
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
                {assignment ? <ShiftBadge shift={assignment.shift} /> : <div className="text-xs text-gray-400 italic">Not assigned</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-6rem)]">
      {/* Left List */}
      <div className="w-full md:w-80 flex flex-col gap-4">
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
                <div>
                  <div className="font-medium text-sm">{emp.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{emp.employeeId} · {emp.role}</div>
                </div>
                <div className={`text-gray-400 text-lg transition-transform duration-200 ${selected?.id === emp.id ? 'rotate-90 text-teal-500' : ''}`}>›</div>
              </button>
              
              {/* MOBILE ACCORDION VIEW */}
              {selected?.id === emp.id && (
                <div className="md:hidden px-1 animate-in slide-in-from-top-2 fade-in duration-200">
                  {detailsPanel}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Details - DESKTOP ONLY */}
      <div className="hidden md:flex flex-1 min-w-0 flex-col overflow-auto pr-2">
        {selected ? detailsPanel : (
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
    </div>
  );
}
}

### 3. `src/lib/store.ts`
This contains the new `getNightShiftProgress` logic that calculates your night shifts exclusively for the current month.

```typescript
import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials, LeaveRecord
} from '@/types';

const API_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const SHIFT_INFO: Record<ShiftType, ShiftInfo> = {
  morning: { type: 'morning', label: 'Morning', time: '7:00 AM – 3:30 PM', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  evening: { type: 'evening', label: 'Evening', time: '2:30 PM – 11:00 PM', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-200 dark:border-cyan-800' },
  night:   { type: 'night', label: 'Night', time: '10:30 PM – 7:00 AM', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
  off:     { type: 'off', label: 'Off Day', time: 'No Shift', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700' },
};

const LS_KEY = 'rs_all_v2';
const CACHE_TTL = 5 * 60 * 1000;

function lsGet<T>(key: string): { data: T; ts: number } | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function lsSet(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function lsClear(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch {}
}

function toISODate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const match = dateStr.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/i);
  if (match) {
    const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const m = MONTHS[match[2].toLowerCase()];
    if (m !== undefined) {
      const dt = new Date(parseInt(match[3],10), m, parseInt(match[1],10));
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
  }
  return dateStr;
}

function toEmployee(e: Record<string, unknown>): Employee {
  return {
    id:           String(e.id           ?? ''),
    name:         String(e.name         ?? ''),
    employeeId:   String(e.employeeId   ?? ''),
    role:         String(e.role         ?? ''),
    active:       true,
    createdAt:    toISODate(String(e.createdAt ?? '')),
    weeklyOffDay: typeof e.weeklyOffDay === 'number' ? e.weeklyOffDay : (e.weeklyOffDay ? parseInt(String(e.weeklyOffDay), 10) : undefined),
    defaultShift: (e.defaultShift as ShiftType) || 'morning',
  };
}

function toAssignment(a: Record<string, unknown>): ShiftAssignment {
  return {
    employeeId:       String(a.employeeId ?? ''),
    shift:            (a.shift as ShiftType) ?? 'morning',
    effectiveFrom:    toISODate(String(a.effectiveFrom ?? '')),
    effectiveTo:      toISODate(String(a.effectiveTo  ?? '')),
    reason:           (a.reason && a.reason !== '') ? String(a.reason) : undefined,
    isOffDayOverride: a.isOffDayOverride === true || a.isOffDayOverride === 'TRUE',
  };
}

function toRoster(raw: Record<string, unknown[]>): RosterData {
  const roster: RosterData = {};
  for (const [date, assignments] of Object.entries(raw)) {
    roster[date] = (assignments as Record<string, unknown>[]).map(toAssignment);
  }
  return roster;
}

interface AllData {
  employees: Employee[];
  roster: RosterData;
  settings: SiteSettings;
  auth: AdminCredentials;
}

let memCache: AllData | null = null;
let fetchPromise: Promise<AllData> | null = null;

export function invalidateCache() {
  memCache = null;
  fetchPromise = null;
  lsClear(LS_KEY);
}

async function fetchAll(): Promise<AllData> {
  if (fetchPromise) return fetchPromise;
  
  fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}?action=getAll`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'ok') throw new Error(json.message || 'API error');
      const d = json.data;
      const result: AllData = {
        employees: (d.employees as Record<string, unknown>[]).map(toEmployee),
        roster:    toRoster(d.roster as Record<string, unknown[]>),
        settings:  {
          siteName:  String(d.settings?.siteName  ?? 'PXL Sales Routine'),
          logoEmoji: String(d.settings?.logoEmoji ?? '⬡'),
          logoImage: d.settings?.logoImage ? String(d.settings.logoImage) : undefined,
        },
        auth: {
          username: d.auth?.username ? String(d.auth.username) : undefined,
          password: d.auth?.password ? String(d.auth.password) : undefined,
        },
      };
      memCache = result;
      lsSet(LS_KEY, result);
      return result;
    } finally {
      fetchPromise = null;
    }
  })();
  
  return fetchPromise;
}

async function getAll(): Promise<AllData> {
  if (memCache) return memCache;
  const cached = lsGet<AllData>(LS_KEY);
  if (cached) {
    memCache = cached.data;
    if (Date.now() - cached.ts > CACHE_TTL) fetchAll().catch(() => {});
    return memCache;
  }
  return fetchAll();
}

async function apiPost(action: string, payload: Record<string, unknown>): Promise<void> {
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
}

export async function getEmployees(): Promise<Employee[]> { return (await getAll()).employees; }
export async function getRoster(): Promise<RosterData> { return (await getAll()).roster; }
export async function getSiteSettings(): Promise<SiteSettings> {
  try { return (await getAll()).settings; } catch { return { siteName: 'PXL', logoEmoji: '⬡' }; }
}
export async function getAdminCreds(): Promise<AdminCredentials> {
  try { return (await getAll()).auth; } catch { return {}; }
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  await apiPost('saveEmployees', { employees });
  if (memCache) { memCache = { ...memCache, employees }; lsSet(LS_KEY, memCache); }
}
export async function saveRoster(roster: RosterData): Promise<void> {
  await apiPost('saveRoster', { roster });
  if (memCache) { memCache = { ...memCache, roster }; lsSet(LS_KEY, memCache); }
}
export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await apiPost('saveSettings', { settings });
  if (memCache) { memCache = { ...memCache, settings }; lsSet(LS_KEY, memCache); }
}
export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  await apiPost('saveAuth', { auth: creds });
  if (memCache) { memCache = { ...memCache, auth: creds }; lsSet(LS_KEY, memCache); }
}

export function getAssignment(roster: RosterData, employee: Employee, date: string): ShiftAssignment | undefined {
  return (roster[date] ?? []).find(a => a.employeeId === employee.id || a.employeeId === employee.employeeId);
}

export function upsertAssignmentLocal(roster: RosterData, date: string, assignment: ShiftAssignment): RosterData {
  let empId1 = assignment.employeeId;
  let empId2 = assignment.employeeId;
  if (memCache) {
    const emp = memCache.employees.find(e => e.id === assignment.employeeId || e.employeeId === assignment.employeeId);
    if (emp) { empId1 = emp.id; empId2 = emp.employeeId; }
  }
  const others = (roster[date] ?? []).filter(a => a.employeeId !== empId1 && a.employeeId !== empId2);
  return { ...roster, [date]: [...others, assignment] };
}

export async function upsertAssignment(roster: RosterData, date: string, assignment: ShiftAssignment): Promise<RosterData> {
  const next = upsertAssignmentLocal(roster, date, assignment);
  await saveRoster(next);
  return next;
}

export async function applyWeeklyOffDay(
  roster: RosterData, employee: Employee, offWeekday: number, year: number, month: number, startDay = 1
): Promise<RosterData> {
  const days = new Date(year, month, 0).getDate();
  let updated = { ...roster };
  for (let d = startDay; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isOff = new Date(year, month - 1, d).getDay() === offWeekday;
    
    const existing = getAssignment(updated, employee, dateStr);
    
    updated = upsertAssignmentLocal(updated, dateStr, {
      employeeId: employee.id,
      shift: isOff ? 'off' : (existing ? existing.shift : (employee.defaultShift ?? 'morning')),
      effectiveFrom: existing ? (existing.effectiveFrom || dateStr) : dateStr,
      effectiveTo: existing ? (existing.effectiveTo || dateStr) : dateStr,
      reason: existing ? existing.reason : undefined,
      isOffDayOverride: isOff ? true : (existing ? existing.isOffDayOverride : false),
    });
  }
  await saveRoster(updated);
  return updated;
}

export async function overrideSingleDay(
  roster: RosterData, employee: Employee, date: string, shift: ShiftType, reason?: string,
): Promise<RosterData> {
  return upsertAssignment(roster, date, {
    employeeId: employee.id, shift, effectiveFrom: date, effectiveTo: date, reason, isOffDayOverride: true,
  });
}

export function getLeaveOnDate(roster: RosterData, employee: Employee, dateStr: string): LeaveRecord | null {
  const a = (roster[dateStr] ?? []).find(x => (x.employeeId === employee.id || x.employeeId === employee.employeeId) && x.reason?.startsWith('LEAVE|'));
  if (a) {
    const parts = a.reason!.split('|');
    return { employeeId: employee.id, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
  }
  return null;
}

export function isOnLeave(roster: RosterData, employee: Employee, dateStr: string): boolean {
  return !!getLeaveOnDate(roster, employee, dateStr);
}

export function getActiveLeave(roster: RosterData, employee: Employee): LeaveRecord | null {
  const today = todayKey();
  for (let i = -3; i <= 31; i++) {
    const dt = new Date(new Date(today + 'T00:00:00').getTime() + i * 86400000);
    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const a = (roster[dateStr] ?? []).find(x => (x.employeeId === employee.id || x.employeeId === employee.employeeId) && x.reason?.startsWith('LEAVE|'));
    if (a) {
      const parts = a.reason!.split('|');
      if (parts[2] >= today) return { employeeId: employee.id, fromDate: parts[1], toDate: parts[2], reason: parts[3] || undefined };
    }
  }
  return null;
}

export function getEffectiveDate(inputDate?: Date): Date {
  const date = inputDate || new Date();
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const bdtDate = new Date(utc + (3600000 * 6));
  if (bdtDate.getHours() < 7) bdtDate.setDate(bdtDate.getDate() - 1);
  return bdtDate;
}

export function todayKey(): string {
  const d = getEffectiveDate();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function get15Days(startDate: string): string[] {
  const [y, m, d] = startDate.split('-').map(Number);
  return Array.from({ length: 15 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
export function getWeekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
  const dates: string[] = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() === weekday)
      dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  return dates;
}

// ✅ FIXED: Counts night shifts in the current month only.
// Completed = nights worked from 1st of month up to (but NOT including) today.
// Remaining = nights scheduled from today to end of month.
// Off days are excluded (they have shift='off', not 'night').
export function getNightShiftProgress(
  roster: RosterData, employee: Employee, selectedDate: string = todayKey(),
) {
  const [year, month] = selectedDate.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let completed = 0;
  let remaining = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const assignment = getAssignment(roster, employee, dateStr);
    if (!assignment || assignment.shift !== 'night') continue;
    if (isOnLeave(roster, employee, dateStr)) continue;

    if (dateStr < selectedDate) {
      completed++;
    } else {
      // today and future days count as remaining
      remaining++;
    }
  }

  const total = completed + remaining;

  return {
    year,
    month,
    completed,
    remaining,
    total,
  };
}
