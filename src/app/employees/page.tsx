'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, getRoster, saveRoster, getActiveLeave, SHIFT_INFO, get15Days, todayKey, invalidateCache, getNightShiftProgress } from '@/lib/store';
import { Employee, RosterData, LeaveRecord } from '@/types';
import { useAuth } from '@/lib/auth';
import ShiftBadge from '@/components/shared/ShiftBadge';
import AssignShiftModal from '@/components/shared/AssignShiftModal';

const blank = () => ({ name: '', employeeId: '', role: '', active: true });

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [search, setSearch]       = useState('');
  const [editing, setEditing]     = useState<Employee | null>(null);
  const [form, setForm]           = useState(blank());
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected]   = useState<Employee | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ emp: Employee; date: string } | null>(null);
  const [leaveModalEmp, setLeaveModalEmp] = useState<Employee | null>(null);
  const [leaveForm, setLeaveForm] = useState({ fromDate: todayKey(), toDate: todayKey(), reason: '' });
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'upcoming' | 'nights'>('upcoming');

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

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({ name: emp.name, employeeId: emp.employeeId, role: emp.role, active: emp.active });
    setShowModal(true);
  }

  async function save() {
    if (!form.name || !form.employeeId) return;
    setSaving(true);
    let updated: Employee[];
    if (editing) {
      updated = employees.map(e => e.id === editing.id ? { ...editing, ...form } : e);
    } else {
      updated = [...employees, { id: Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], ...form }];
    }
    await saveEmployees(updated);
    setEmployees(updated);
    setShowModal(false);
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Remove this employee?')) return;
    const updated = employees.filter(e => e.id !== id);
    await saveEmployees(updated);
    setEmployees(updated);
    if (selected?.id === id) setSelected(null);
  }

  async function assignLeave() {
    if (!leaveForm.fromDate || !leaveForm.toDate || !leaveModalEmp) return;
    const f1 = new Date(leaveForm.fromDate);
    const f2 = new Date(leaveForm.toDate);
    const diffDays = Math.round((f2.getTime() - f1.getTime()) / 86400000);
    
    if (diffDays < 0) { alert('To Date must be after From Date'); return; }
    if (diffDays > 31) { alert('Leave can be a maximum of 31 days'); return; }

    setSaving(true);
    try {
      let updatedRoster = { ...roster };
      const leaveReasonStr = `LEAVE|${leaveForm.fromDate}|${leaveForm.toDate}|${leaveForm.reason}`;
      
      for (let d = 0; d <= diffDays; d++) {
        const dt = new Date(f1.getTime() + d * 86400000);
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        
        const others = (updatedRoster[dateStr] ?? []).filter(a => a.employeeId !== leaveModalEmp.employeeId);
        updatedRoster[dateStr] = [...others, {
          employeeId: leaveModalEmp.employeeId,
          shift: 'off',
          effectiveFrom: dateStr,
          effectiveTo: dateStr,
          reason: leaveReasonStr,
          isOffDayOverride: true,
        }];
      }
      
      await saveRoster(updatedRoster);
      setRoster(updatedRoster);
      setLeaveModalEmp(null);
    } catch (err: any) {
      alert("Failed to save leave. Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeLeave(leave: LeaveRecord) {
    if (!confirm('Remove this leave?')) return;
    setSaving(true);
    try {
      let updatedRoster = { ...roster };
      const f1 = new Date(leave.fromDate);
      const f2 = new Date(leave.toDate);
      const diffDays = Math.round((f2.getTime() - f1.getTime()) / 86400000);
      
      for (let d = 0; d <= diffDays; d++) {
        const dt = new Date(f1.getTime() + d * 86400000);
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        
        updatedRoster[dateStr] = (updatedRoster[dateStr] ?? []).filter(a => 
           !(a.employeeId === leave.employeeId && a.reason?.startsWith('LEAVE|'))
        );
      }
      
      await saveRoster(updatedRoster);
      setRoster(updatedRoster);
    } catch(e: any) {
      alert("Failed to remove leave. Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const upcoming15 = selected ? get15Days(todayKey()).map(date => {
    const a = (roster[date] ?? []).find(x => x.employeeId === selected.employeeId);
    return { date, assignment: a };
  }) : [];

  const nightProgress = selected ? getNightShiftProgress(roster, selected.employeeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin text-4xl">⟳</div>
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
          <button
            onClick={() => load(true)}
            className="btn-primary text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Employees</h1>
        <div className="flex gap-2">
          <input className="input w-56" placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)} />
          <button
            className="btn-ghost text-xs border border-gray-200 dark:border-gray-700"
            onClick={() => load(true)}
            title="Refresh from Google Sheets">
            ↻ Refresh
          </button>
          {isAdmin && <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Employee</th>
                {isAdmin && <th className="px-4 py-3 text-left">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(emp => (
                <tr key={emp.id}
                  onClick={() => setSelected(selected?.id === emp.id ? null : emp)}
                  className={`cursor-pointer transition-colors ${selected?.id === emp.id ? 'bg-teal-50 dark:bg-teal-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button className="btn-ghost text-xs" onClick={() => openEdit(emp)}>Edit</button>
                        <button className="btn-danger text-xs" onClick={() => remove(emp.id)}>✕</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No employees found.</p>}
        </div>

        <div className="card p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">{selected.name}</h2>
                  <p className="text-xs text-gray-500">{selected.employeeId} · {selected.role}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700"
                      onClick={() => {
                         setLeaveModalEmp(selected);
                         setLeaveForm({ fromDate: todayKey(), toDate: todayKey(), reason: '' });
                      }}>
                      ✈️ Leave
                    </button>
                    <button className="btn-primary text-xs"
                      onClick={() => setAssignTarget({ emp: selected, date: todayKey() })}>
                      + Assign Shift
                    </button>
                  </div>
                )}
              </div>

              {(() => {
                const activeLeave = getActiveLeave(roster, selected.employeeId);
                if (!activeLeave) return null;
                return (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-amber-800 dark:text-amber-500">✈️ On Leave</div>
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        {new Date(activeLeave.fromDate + 'T00:00:00').toLocaleDateString()} – {new Date(activeLeave.toDate + 'T00:00:00').toLocaleDateString()}
                        {activeLeave.reason && ` · ${activeLeave.reason}`}
                      </div>
                    </div>
                    {isAdmin && (
                      <button className="text-xs text-red-500 font-medium hover:underline disabled:opacity-50"
                        onClick={() => removeLeave(activeLeave)}
                        disabled={saving}>
                        {saving ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-1 mb-3 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setDetailTab('upcoming')}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors
                    ${detailTab === 'upcoming' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  Upcoming 15 Days
                </button>
                <button
                  onClick={() => setDetailTab('nights')}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors
                    ${detailTab === 'nights' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  Night Shifts
                </button>
              </div>

              {detailTab === 'upcoming' && (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {upcoming15.map(({ date, assignment }) => {
                  const info = assignment ? SHIFT_INFO[assignment.shift] : null;
                  const isToday = date === todayKey();
                  const isPast  = date < todayKey();
                  return (
                    <div key={date}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm
                        ${isToday ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800' : 'bg-gray-50 dark:bg-gray-800/40'}
                        ${isPast ? 'opacity-60' : ''}`}>
                      <div className="w-20 text-xs text-gray-500 shrink-0">
                        {isToday ? <span className="text-teal-600 font-semibold">Today</span> : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </div>
                      {info ? (
                        <div className="flex items-center gap-2">
                          <ShiftBadge shift={assignment!.shift} />
                          {assignment!.reason?.startsWith('LEAVE|') ? (
                            <span className="text-xs text-amber-500 font-medium">✈️ On Leave</span>
                          ) : (
                            <span className="text-xs text-gray-400">{info.time}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">Not assigned</span>
                      )}
                      {isAdmin && !isPast && (
                        <button className="ml-auto text-xs text-teal-500 hover:text-teal-700"
                          onClick={() => setAssignTarget({ emp: selected, date })}>
                          {assignment ? 'Change' : 'Assign'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              )}

              {detailTab === 'nights' && nightProgress && (
                <div className="space-y-4">
                  <div className="text-xs text-gray-400">
                    {nightProgress.totalNights === 0 ? "No night shifts assigned this block." : `${nightProgress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${nightProgress.rangeTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">{nightProgress.completedNights}</div>
                      <div className="text-xs text-gray-400 mt-1">Completed</div>
                    </div>
                    <div className="text-2xl text-gray-300">/</div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-400">{nightProgress.totalNights}</div>
                      <div className="text-xs text-gray-400 mt-1">Total Assigned</div>
                    </div>
                    <div className="ml-auto text-center">
                      <div className="text-2xl font-bold text-amber-500">{nightProgress.remainingNights}</div>
                      <div className="text-xs text-gray-400 mt-1">Remaining</div>
                    </div>
                  </div>
                  {nightProgress.totalNights > 0 && (
                    <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${(nightProgress.completedNights / nightProgress.totalNights) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-300 dark:text-gray-600">
              <div className="text-4xl mb-2">👆</div>
              <p className="text-sm">Click an employee to view their upcoming shifts</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">{editing ? 'Edit Employee' : 'Add Employee'}</h2>
            {(['name', 'employeeId', 'role'] as const).map(field => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1">{field === 'employeeId' ? 'Employee ID' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <input className="input" value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <AssignShiftModal
          employee={assignTarget.emp}
          date={assignTarget.date}
          currentShift={(roster[assignTarget.date] ?? []).find(a => a.employeeId === assignTarget.emp.id)?.shift}
          roster={roster}
          onSave={(newRoster, updatedEmp) => {
            setRoster(newRoster);
            if (updatedEmp) {
              const updated = employees.map(e => e.id === updatedEmp.id ? updatedEmp : e);
              saveEmployees(updated);
              setEmployees(updated);
            }
          }}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {leaveModalEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">Assign Leave for {leaveModalEmp.name}</h2>
            <div className="bg-amber-50 p-3 rounded text-sm text-amber-800 border border-amber-200">
              ⚠️ Maximum of 31 days allowed. Existing shifts on these days will be replaced.
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">From Date</label>
                <input type="date" className="input" value={leaveForm.fromDate} onChange={e => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">To Date</label>
                <input type="date" className="input" value={leaveForm.toDate} onChange={e => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason (optional)</label>
              <input type="text" className="input" placeholder="e.g. Sick, Vacation" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn-ghost" onClick={() => setLeaveModalEmp(null)}>Cancel</button>
              <button className="btn-primary bg-amber-500 hover:bg-amber-600 text-white border-0" onClick={assignLeave} disabled={saving}>
                {saving ? 'Saving…' : 'Assign Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
