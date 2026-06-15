'use client';
import { useEffect, useState } from 'react';
import { getEmployees, saveEmployees, getRoster, SHIFT_INFO, get15Days, todayKey } from '@/lib/store';
import { Employee, RosterData } from '@/types';
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
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    Promise.all([getEmployees(), getRoster()]).then(([emps, ros]) => {
      setEmployees(emps);
      setRoster(ros);
      setLoading(false);
    });
  }, []);

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

  async function toggle(id: string) {
    const updated = employees.map(e => e.id === id ? { ...e, active: !e.active } : e);
    await saveEmployees(updated);
    setEmployees(updated);
  }

  const upcoming15 = selected ? get15Days(todayKey()).map(date => {
    const a = (roster[date] ?? []).find(x => x.employeeId === selected.id);
    return { date, assignment: a };
  }) : [];

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Employees</h1>
        <div className="flex gap-2">
          <input className="input w-56" placeholder="Search name or ID…" value={search} onChange={e => setSearch(e.target.value)} />
          {isAdmin && <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-left">Status</th>
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
                  <td className="px-4 py-3">
                    <span className={`badge ${emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button className="btn-ghost text-xs" onClick={() => openEdit(emp)}>Edit</button>
                        <button className="btn-ghost text-xs" onClick={() => toggle(emp.id)}>{emp.active ? 'Deactivate' : 'Activate'}</button>
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
                  <button className="btn-primary text-xs"
                    onClick={() => setAssignTarget({ emp: selected, date: todayKey() })}>
                    + Assign Shift
                  </button>
                )}
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Upcoming 15 Days</h3>
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
                          <span className="text-xs text-gray-400">{info.time}</span>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
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
    </div>
  );
}
