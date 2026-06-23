'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, getRoster, saveEmployees, SHIFT_INFO, get15Days, todayKey, invalidateCache, getAssignment, getArchiveRoster } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';
import { useAuth } from '@/lib/auth';
import ShiftBadge from '@/components/shared/ShiftBadge';
import AssignShiftModal from '@/components/shared/AssignShiftModal';
import { AlertDialog } from '@/components/shared/Dialogs';
import DailyShiftBreakdownModal from '@/components/roster/DailyShiftBreakdownModal';

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
  const [archiveMonth, setArchiveMonth] = useState<string>('current');
  const [archiveRoster, setArchiveRoster] = useState<RosterData | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ open: boolean; title?: string; message: string; type?: 'error'|'warning' }>({ open: false, message: '' });
  
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const monthOptions = [{ value: 'current', label: 'Current Roster' }];
  const d = new Date();
  d.setDate(1);
  for (let i = 1; i <= 12; i++) {
    d.setMonth(d.getMonth() - 1);
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    monthOptions.push({ value: mStr, label });
  }

  const isArchive = archiveMonth !== 'current';
  
  let days: string[] = [];
  if (!isArchive) {
    days = get15Days(todayKey());
  } else {
    const [y, m] = archiveMonth.split('-').map(Number);
    const numDays = new Date(y, m, 0).getDate();
    days = Array.from({ length: numDays }, (_, i) => `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  }

  const activeRoster: RosterData = isArchive ? (archiveRoster || {}) : roster;

  useEffect(() => {
    if (archiveMonth === 'current') {
      setArchiveRoster(null);
      return;
    }
    const [y, m] = archiveMonth.split('-').map(Number);
    setLoadingArchive(true);
    getArchiveRoster(y, m)
      .then(setArchiveRoster)
      .catch(err => alert("Failed to load archive: " + err.message))
      .finally(() => setLoadingArchive(false));
  }, [archiveMonth]);

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

  const filteredEmployees = employees
    .filter(e => search === '' || e.name.toLowerCase().includes(search.toLowerCase()) || e.employeeId.toLowerCase().includes(search.toLowerCase()));

  // Calendar rendering logic
  const renderCalendar = () => {
    let year, month;
    if (isArchive) {
      [year, month] = archiveMonth.split('-').map(Number);
    } else {
      const td = new Date();
      year = td.getFullYear();
      month = td.getMonth() + 1;
    }
    
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
    
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm mt-4 bg-white dark:bg-gray-900">
        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center font-bold text-gray-500 text-sm py-2 uppercase tracking-wider">{d}</div>
          ))}
          {blanks.map(b => <div key={`b-${b}`} className="p-2" />)}
          {monthDays.map(d => {
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = dateStr === todayKey();
            // Count total assignments for this day
            let totalAssigned = 0;
            employees.forEach(emp => {
              const a = getAssignment(activeRoster, emp, dateStr);
              if (a && a.shift && !['off', 'leave'].includes(a.shift)) {
                totalAssigned++;
              }
            });

            return (
              <button 
                key={d} 
                onClick={() => setSelectedCalendarDate(dateStr)}
                className={`min-h-[80px] p-2 flex flex-col items-center justify-center rounded-xl border transition-all hover:shadow-md
                  ${isToday ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800/50 shadow-sm ring-1 ring-teal-500/20' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-teal-300'}`}
              >
                <div className={`text-lg font-bold ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-700 dark:text-gray-300'}`}>{d}</div>
                {totalAssigned > 0 ? (
                  <div className="mt-1 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-0.5 rounded-full">
                    {totalAssigned} Shifts
                  </div>
                ) : (
                   <div className="mt-1 text-[10px] text-gray-300 dark:text-gray-600">—</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl font-bold w-full md:w-auto text-center md:text-left shrink-0">Roster</h1>
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl shrink-0">
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500'}`}
            onClick={() => setViewMode('table')}
          >Matrix View</button>
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500'}`}
            onClick={() => setViewMode('calendar')}
          >Calendar View</button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 flex-1 w-full">
          <input className="input w-full max-w-xs md:w-44" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
          <select 
            className="input text-xs w-full sm:w-auto" 
            value={archiveMonth} 
            onChange={e => setArchiveMonth(e.target.value)}
          >
            {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <div className="flex flex-wrap justify-center gap-1">
            {(['all', ...SHIFTS] as const).map(s => {
              const info = s !== 'all' ? SHIFT_INFO[s] : null;
              return (
                <button
                  key={s} onClick={() => setFilterShift(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                    ${filterShift === s ? info ? `${info.bg} ${info.color} ${info.border}` : 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                   {s === 'all' ? 'All' : info!.label}
                </button>
              );
            })}
          </div>
          <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700 mt-2 sm:mt-0" onClick={() => load(true)} title="Refresh">↻ Refresh</button>
        </div>
      </div>

      {viewMode === 'calendar' ? renderCalendar() : (
      <div className="card overflow-auto max-h-[70vh]">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky left-0 top-0 z-30 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wide min-w-[140px] md:min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-none border-r border-gray-200 dark:border-gray-700">Employee</th>
              {days.map(date => {
                const isToday = !isArchive && date === todayKey();
                const isPast  = !isArchive && date < todayKey();
                return (
                  <th key={date} className={`sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 px-3 py-3 text-center font-medium min-w-[90px] ${isToday ? 'text-teal-600 dark:text-teal-400' : isPast ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500'}`}>
                    <div>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : ''}`}>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    {isToday && <div className="text-[10px] text-teal-500 font-semibold">TODAY</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredEmployees.map(emp => {
              if (filterShift !== 'all') {
                const hasShift = days.some(date => getAssignment(activeRoster, emp, date)?.shift === filterShift);
                if (!hasShift) return null;
              }
              return (
                <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 px-4 py-2.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-none border-r border-gray-200 dark:border-gray-700">
                    <div className="font-medium text-sm">{emp.name}</div>
                    <div className="text-gray-400">{emp.employeeId} · {emp.role}</div>
                  </td>
                  {days.map(date => {
                    const assignment = getAssignment(activeRoster, emp, date);
                    const isPast = !isArchive && date < todayKey();
                    const isToday = !isArchive && date === todayKey();
                    const matchesFilter = filterShift === 'all' || assignment?.shift === filterShift;
                    const canAssign = isAdmin && !isPast && !isArchive;

                    return (
                      <td key={date} className={`px-2 py-2 text-center ${isToday ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''} ${isPast ? 'opacity-50' : ''}`}>
                        {assignment && matchesFilter ? (
                          <button disabled={!canAssign} onClick={() => canAssign && setAssignTarget({ emp, date })} className="w-full disabled:cursor-default">
                            <ShiftBadge shift={assignment.shift} isLeave={assignment.reason?.startsWith('LEAVE|')} />
                          </button>
                        ) : !assignment && filterShift === 'all' ? (
                          canAssign ? (
                            <button onClick={() => setAssignTarget({ emp, date })} className="w-full h-7 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-700 hover:border-teal-400 hover:text-teal-500 transition-colors text-xs">+</button>
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
        {loadingArchive && <div className="p-10 text-center text-gray-400">Loading archived records...</div>}
        {!loadingArchive && filteredEmployees.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No employees found.</p>}
      </div>
      )}
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
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-dashed border-gray-300 text-gray-400">+ click cell to assign</div>
      </div>

      {assignTarget && (
        <AssignShiftModal
          employee={assignTarget.emp}
          date={assignTarget.date}
          currentShift={getAssignment(roster, assignTarget.emp, assignTarget.date)?.shift}
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

      {selectedCalendarDate && (
        <DailyShiftBreakdownModal
          date={selectedCalendarDate}
          roster={activeRoster}
          employees={employees}
          onClose={() => setSelectedCalendarDate(null)}
        />
      )}

      <AlertDialog {...alertConfig} onClose={() => setAlertConfig(p => ({ ...p, open: false }))} />
    </div>
  );
}
