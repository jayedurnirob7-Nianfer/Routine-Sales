'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  getEmployees, getRoster, saveEmployees, SHIFT_INFO,
  get15Days, todayKey, formatDate, invalidateCache,
} from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import ShiftBadge from '@/components/shared/ShiftBadge';
import AssignShiftModal from '@/components/shared/AssignShiftModal';

const SHIFTS: ShiftType[] = ['morning', 'evening', 'night', 'off'];

export default function RosterPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ emp: Employee; date: string } | null>(null);
  const [filterShift, setFilterShift]   = useState<ShiftType | 'all'>('all');
  const [search, setSearch]             = useState('');

  const days = get15Days(todayKey());

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

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  const activeEmployees = employees
    .filter(e => e.active)
    .filter(e =>
      search === '' ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(search.toLowerCase())
    );

  function getAssignment(empId: string, date: string) {
    return (roster[date] ?? []).find(a => a.employeeId === empId);
  }

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
          <button onClick={() => load(true)} className="btn-primary text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Roster</h1>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-44"
            placeholder="Search employee…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Shift filter */}
          <div className="flex gap-1">
            {(['all', ...SHIFTS] as const).map(s => {
              const info = s !== 'all' ? SHIFT_INFO[s] : null;
              return (
                <button
                  key={s}
                  onClick={() => setFilterShift(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                    ${filterShift === s
                      ? info ? `${info.bg} ${info.color} ${info.border}` : 'bg-gray-800 text-white border-gray-800'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  {s === 'all' ? 'All' : info!.label}
                </button>
              );
            })}
          </div>
          <button
            className="btn-ghost text-xs border border-gray-200 dark:border-gray-700"
            onClick={() => load(true)}
            title="Refresh from Google Sheets">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Roster grid — scrollable horizontally */}
      <div className="card overflow-auto max-h-[70vh]">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky left-0 top-0 z-30 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">
                Employee
              </th>
              {days.map(date => {
                const isToday = date === todayKey();
                const isPast  = date < todayKey();
                return (
                  <th
                    key={date}
                    className={`sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 px-3 py-3 text-center font-medium min-w-[90px]
                      ${isToday ? 'text-teal-600 dark:text-teal-400' : isPast ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500'}`}>
                    <div>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : ''}`}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {isToday && <div className="text-[10px] text-teal-500 font-semibold">TODAY</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activeEmployees.map(emp => {
              // If a shift filter is active, only keep rows where this
              // employee has at least one matching day — but the cells
              // themselves are filtered individually below, so other
              // shifts on non-matching days won't be shown.
              if (filterShift !== 'all') {
                const hasShift = days.some(date => getAssignment(emp.id, date)?.shift === filterShift);
                if (!hasShift) return null;
              }
              return (
                <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  {/* Sticky employee name column */}
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 px-4 py-2.5 border-r border-gray-100 dark:border-gray-800">
                    <div className="font-medium text-sm">{emp.name}</div>
                    <div className="text-gray-400">{emp.employeeId} · {emp.role}</div>
                  </td>
                  {days.map(date => {
                    const assignment = getAssignment(emp.id, date);
                    const isPast = date < todayKey();
                    const isToday = date === todayKey();

                    // When a specific shift filter is active, hide cells
                    // that don't match it — only the matching shift type
                    // is ever shown.
                    const matchesFilter = filterShift === 'all' || assignment?.shift === filterShift;

                    return (
                      <td
                        key={date}
                        className={`px-2 py-2 text-center
                          ${isToday ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}
                          ${isPast ? 'opacity-50' : ''}`}>
                        {assignment && matchesFilter ? (
                          <button
                            disabled={!isAdmin || isPast}
                            onClick={() => isAdmin && !isPast && setAssignTarget({ emp, date })}
                            className="w-full">
                            <ShiftBadge shift={assignment.shift} />
                          </button>
                        ) : !assignment && filterShift === 'all' ? (
                          isAdmin && !isPast ? (
                            <button
                              onClick={() => setAssignTarget({ emp, date })}
                              className="w-full h-7 rounded-lg border border-dashed border-gray-200 dark:border-gray-700
                                text-gray-300 dark:text-gray-700 hover:border-teal-400 hover:text-teal-500
                                transition-colors text-xs">
                              +
                            </button>
                          ) : (
                            <span className="text-gray-200 dark:text-gray-700">—</span>
                          )
                        ) : (
                          <span className="text-gray-200 dark:text-gray-700">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {activeEmployees.length === 0 && (
          <p className="text-center py-10 text-gray-400 text-sm">No employees found.</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {SHIFTS.map(s => {
          const info = SHIFT_INFO[s];
          return (
            <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${info.bg} ${info.color} ${info.border}`}>
              <span className="font-medium">{info.label}</span>
              <span className="opacity-60">{info.time}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-dashed border-gray-300 text-gray-400">
          + click cell to assign
        </div>
      </div>

      {assignTarget && (
        <AssignShiftModal
          employee={assignTarget.emp}
          date={assignTarget.date}
          currentShift={getAssignment(assignTarget.emp.id, assignTarget.date)?.shift}
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
