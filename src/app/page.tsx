'use client';
import { useEffect, useState } from 'react';
import { getEmployees, getRoster, isOnLeave, getActiveLeave, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress, invalidateCache } from '@/lib/store';
import { Employee, RosterData, ShiftType } from '@/types';

const TODAY_SHIFTS: ShiftType[] = ['morning', 'evening', 'night'];

const shiftColors: Record<string, string> = {
  morning: 'from-amber-400 to-orange-400',
  evening: 'from-blue-400 to-cyan-400',
  night:   'from-purple-500 to-indigo-500',
  off:     'from-gray-300 to-gray-400',
};
const shiftIcons: Record<string, string> = {
  morning: '🌅', evening: '🌆', night: '🌙', off: '🛌',
};

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<{ emp: Employee; date: string } | null>(null);

  const today = todayKey();

  function load(forceRefresh = false) {
    setLoading(true);
    setError(null);
    if (forceRefresh) invalidateCache();
    Promise.all([getEmployees(), getRoster()])
      .then(([emps, ros]) => {
        setEmployees(emps);
        setRoster(ros);
        setLoading(false);
      })
      .catch(err => {
        console.error('Dashboard load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    return (roster[date] ?? [])
      .filter(a => a.shift === shift && !a.reason?.startsWith('LEAVE|'))
      .map(a => empMap[a.employeeId])
      .filter(emp => emp && !isOnLeave(roster, emp.id, date)) as Employee[];
  }

  function getOnLeaveEmployees(date: string = today): Employee[] {
    return Object.values(empMap).filter(emp => emp && isOnLeave(roster, emp.id, date)) as Employee[];
  }

  function getOffTodayEmployees(date: string = today): Employee[] {
    return (roster[date] ?? [])
      .filter(a => a.shift === 'off' && !a.reason?.startsWith('LEAVE|'))
      .map(a => empMap[a.employeeId])
      .filter(emp => emp && !isOnLeave(roster, emp.id, date)) as Employee[];
  }

  function getOffEmployeesByDefaultShift(date: string) {
    const offToday = getOffTodayEmployees(date);
    const onLeaveToday = getOnLeaveEmployees(date);
    const grouped: Record<string, Employee[]> = {
      morning: [], evening: [], night: [], off: [],
      leaveMorning: [], leaveEvening: [], leaveNight: [], leaveOff: [],
    };
    const seen = new Set<string>();
    onLeaveToday.forEach(emp => {
      const ds = emp.defaultShift;
      const shift = (ds && TODAY_SHIFTS.includes(ds as ShiftType)) ? ds : 'off';
      grouped[`leave${shift.charAt(0).toUpperCase() + shift.slice(1)}`].push(emp);
      seen.add(emp.id);
    });
    offToday.forEach(emp => {
      if (!seen.has(emp.id)) {
        const ds = emp.defaultShift;
        const shift = (ds && TODAY_SHIFTS.includes(ds as ShiftType)) ? ds : 'off';
        grouped[shift].push(emp);
      }
    });
    return grouped;
  }

  const all15Days = get15Days(today);

  function getUpcomingDays() {
    return all15Days.filter(d => d !== today).map(date => {
      const offByShift = getOffEmployeesByDefaultShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => ({
          shift,
          employees: getShiftEmployees(shift, date),
          offEmployees: offByShift[shift] || [],
          onLeaveEmployees: offByShift[`leave${shift.charAt(0).toUpperCase() + shift.slice(1)}`] || [],
        })),
        unsortedOff: offByShift.off || [],
        unsortedLeave: offByShift.leaveOff || [],
      };
    });
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-400 text-sm">Loading from Google Sheets…</p>
          <p className="text-gray-500 text-xs">This may take up to 15 seconds on first load</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-500 font-medium">Could not connect to Google Sheets</p>
          <p className="text-gray-400 text-xs">{error}</p>
          <button onClick={() => load(true)} className="btn-primary text-sm">
            ↻ Retry
          </button>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayOffByShift = getOffEmployeesByDefaultShift(today);

  function NightProgressPopover({ employee, date }: { employee: Employee; date: string }) {
    const progress = getNightShiftProgress(roster, employee.id, date);
    const displayLeave = getActiveLeave(roster, employee.id);
    const rangeLabel = progress.totalNights === 0
      ? progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `${progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${progress.rangeTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return (
      <div className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold">{employee.name}</div>
          <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setSelectedEmp(null)}>✕</button>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">{rangeLabel} · Night Shifts</div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-600">{progress.completedNights}</div>
            <div className="text-[10px] text-gray-400">Done</div>
          </div>
          <div className="text-gray-300">/</div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-400">{progress.totalNights}</div>
            <div className="text-[10px] text-gray-400">Total</div>
          </div>
          <div className="ml-auto text-center">
            <div className="text-xl font-bold text-amber-500">{progress.remainingNights}</div>
            <div className="text-[10px] text-gray-400">Left</div>
          </div>
        </div>
        {progress.totalNights > 0 && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
            <div className="h-full bg-purple-500" style={{ width: `${(progress.completedNights / progress.totalNights) * 100}%` }} />
          </div>
        )}
        {progress.totalNights === 0 && <p className="text-[10px] text-gray-400 mt-1">No night shifts in this block.</p>}
        {displayLeave && (
          <div className="mt-2 text-[10px] text-amber-500 font-medium">
            ✈️ On leave: {new Date(displayLeave.fromDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(displayLeave.toDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
    );
  }

  function EmployeeRow({ emp, muted = false, date, shiftType }: { emp: Employee; muted?: boolean; date: string; shiftType?: ShiftType }) {
    const isSelected = selectedEmp?.emp.id === emp.id && selectedEmp?.date === date;
    let progressBadge = null;
    if (shiftType === 'night' && !muted) {
      const prog = getNightShiftProgress(roster, emp.id, date);
      if (prog.totalNights > 0) {
        progressBadge = (
          <span className="ml-2 text-[10px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded">
            {prog.completedNights} / {prog.totalNights}
          </span>
        );
      }
    }
    return (
      <div className="relative flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg -mx-1 px-1 py-0.5"
        onClick={() => setSelectedEmp(isSelected ? null : { emp, date })}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-100 dark:bg-gray-800 ${muted ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
          {emp.name.charAt(0)}
        </div>
        <div>
          <div className={`text-sm font-medium flex items-center ${muted ? 'text-gray-400' : ''}`}>
            {emp.name}{progressBadge}
          </div>
          <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
        </div>
        {isSelected && <NightProgressPopover employee={emp} date={date} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, onLeaveEmployees = [], date }: {
    shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; onLeaveEmployees?: Employee[]; date: string;
  }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
              <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
            </div>
            <div className="text-3xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {employees.length === 0
            ? <p className="text-gray-400 text-sm">No one assigned</p>
            : <div className="space-y-2">{employees.map(emp => <EmployeeRow key={emp.id} emp={emp} date={date} shiftType={shift} />)}</div>
          }
          {offEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">🛌 Off Today</div>
              {offEmployees.map(emp => <EmployeeRow key={emp.id} emp={emp} muted date={date} />)}
            </div>
          )}
          {onLeaveEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold">✈️ On Leave</div>
              {onLeaveEmployees.map(emp => <EmployeeRow key={emp.id} emp={emp} muted date={date} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  function UnsortedOffCard({ employees, onLeaveEmployees = [], date }: { employees: Employee[]; onLeaveEmployees?: Employee[]; date: string }) {
    if (employees.length === 0 && onLeaveEmployees.length === 0) return null;
    return (
      <div className="card overflow-visible border border-dashed border-gray-300 dark:border-gray-700">
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60">
          {employees.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">🛌 Off Day (no prior shift on record)</div>
              <div className="flex flex-wrap gap-3">
                {employees.map(emp => <div key={emp.id} className="relative"><EmployeeRow emp={emp} muted date={date} /></div>)}
              </div>
            </div>
          )}
          {onLeaveEmployees.length > 0 && (
            <div className={employees.length > 0 ? 'pt-2 border-t border-gray-200 dark:border-gray-700' : ''}>
              <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold mb-2">✈️ On Leave (no prior shift on record)</div>
              <div className="flex flex-wrap gap-3">
                {onLeaveEmployees.map(emp => <div key={emp.id} className="relative"><EmployeeRow emp={emp} muted date={date} /></div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{formatDate(today)} — Today's Overview</p>
        </div>
        <button onClick={() => load(true)} className="btn-ghost text-xs border border-gray-200 dark:border-gray-700">↻ Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TODAY_SHIFTS.map(shift => (
          <ShiftCard
            key={shift} shift={shift} date={today}
            employees={getShiftEmployees(shift, today)}
            offEmployees={todayOffByShift[shift] || []}
            onLeaveEmployees={todayOffByShift[`leave${shift.charAt(0).toUpperCase() + shift.slice(1)}`] || []}
          />
        ))}
      </div>
      <UnsortedOffCard employees={todayOffByShift.off || []} onLeaveEmployees={todayOffByShift.leaveOff || []} date={today} />

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Upcoming Shifts (Next 14 Days)</h2>
        {getUpcomingDays().map(day => (
          <div key={day.date} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees, onLeaveEmployees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees}
                  offEmployees={offEmployees} onLeaveEmployees={onLeaveEmployees} date={day.date} />
              ))}
            </div>
            <UnsortedOffCard employees={day.unsortedOff} onLeaveEmployees={day.unsortedLeave} date={day.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
