'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, getRoster, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress, invalidateCache } from '@/lib/store';
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

// Unique key for identifying a specific popover location
interface PopoverTarget {
  empId: string;
  date: string;
  shift: ShiftType;
}

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Bug 1 fix: store a composite key, not just the employee
  const [popoverTarget, setPopoverTarget] = useState<PopoverTarget | null>(null);
  const today = todayKey();

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

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    return (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => empMap[a.employeeId])
      .filter(Boolean) as Employee[];
  }

  function prevDateKey(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function getOffEmployeesByPrevShift(date: string): Record<ShiftType, Employee[]> {
    const offToday = getShiftEmployees('off', date);
    const grouped: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const yesterday = prevDateKey(date);

    offToday.forEach(emp => {
      const yesterdayAssignment = (roster[yesterday] ?? []).find(a => a.employeeId === emp.id);
      if (yesterdayAssignment && TODAY_SHIFTS.includes(yesterdayAssignment.shift)) {
        grouped[yesterdayAssignment.shift].push(emp);
      } else {
        grouped.off.push(emp);
      }
    });
    return grouped;
  }

  const all15Days = get15Days(today);

  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => {
      const offByShift = getOffEmployeesByPrevShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => ({
          shift,
          employees: getShiftEmployees(shift, date),
          offEmployees: offByShift[shift],
        })),
        unsortedOff: offByShift.off,
      };
    });
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
          <button onClick={() => load(true)} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayOffByShift = getOffEmployeesByPrevShift(today);

  // Bug 1 fix: check popover match using composite key (empId + date + shift)
  function isPopoverOpen(empId: string, date: string, shift: ShiftType): boolean {
    if (!popoverTarget) return false;
    return popoverTarget.empId === empId && popoverTarget.date === date && popoverTarget.shift === shift;
  }

  function togglePopover(empId: string, date: string, shift: ShiftType) {
    if (isPopoverOpen(empId, date, shift)) {
      setPopoverTarget(null);
    } else {
      setPopoverTarget({ empId, date, shift });
    }
  }

  function NightProgressPopover({ employee }: { employee: Employee }) {
    const progress = getNightShiftProgress(roster, employee, today);
    return (
      <div
        className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold">{employee.name}</div>
          <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setPopoverTarget(null)}>✕</button>
        </div>
        <div className="text-[10px] text-gray-400 mb-2">
          {new Date(progress.year, progress.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Night Shifts
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-600">{progress.completed}</div>
            <div className="text-[10px] text-gray-400">Done</div>
          </div>
          <div className="text-gray-300">/</div>
          <div className="text-center">
            <div className="text-xl font-bold text-gray-400">{progress.total}</div>
            <div className="text-[10px] text-gray-400">Total</div>
          </div>
          <div className="ml-auto text-center">
            <div className="text-xl font-bold text-amber-500">{progress.remaining}</div>
            <div className="text-[10px] text-gray-400">Left</div>
          </div>
        </div>
        {progress.total > 0 && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mt-2">
            <div className="h-full bg-purple-500" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
          </div>
        )}
        {progress.total === 0 && <p className="text-[10px] text-gray-400 mt-1">No night shifts this month.</p>}
      </div>
    );
  }

  function EmployeeRow({ emp, date, shift, muted = false }: { emp: Employee; date: string; shift: ShiftType; muted?: boolean }) {
    const showPopover = isPopoverOpen(emp.id, date, shift);
    return (
      <div
        className="relative flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg -mx-1 px-1 py-0.5"
        onClick={() => togglePopover(emp.id, date, shift)}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${muted ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          {emp.name.charAt(0)}
        </div>
        <div>
          <div className={`text-sm font-medium ${muted ? 'text-gray-400' : ''}`}>{emp.name}</div>
          <div className="text-xs text-gray-400">{emp.employeeId} · {emp.role}</div>
        </div>
        {showPopover && <NightProgressPopover employee={emp} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; date: string }) {
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
          {employees.length === 0 ? (
            <p className="text-gray-400 text-sm">No one assigned</p>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} date={date} shift={shift} />
              ))}
            </div>
          )}

          {offEmployees.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">🛌 Off Today</div>
              {offEmployees.map(emp => (
                <EmployeeRow key={emp.id} emp={emp} date={date} shift={shift} muted />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function UnsortedOffCard({ employees, date }: { employees: Employee[]; date: string }) {
    if (employees.length === 0) return null;
    return (
      <div className="card overflow-visible border border-dashed border-gray-300 dark:border-gray-700">
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
            🛌 Off Day (no prior shift on record)
          </div>
          <div className="flex flex-wrap gap-3">
            {employees.map(emp => (
              <div key={emp.id} className="relative">
                <EmployeeRow emp={emp} date={date} shift="off" muted />
              </div>
            ))}
          </div>
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
        <button
          className="btn-ghost text-xs border border-gray-200 dark:border-gray-700"
          onClick={() => load(true)}
          title="Refresh from Google Sheets">
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TODAY_SHIFTS.map(shift => (
          <ShiftCard
            key={shift}
            shift={shift}
            employees={getShiftEmployees(shift)}
            offEmployees={todayOffByShift[shift]}
            date={today}
          />
        ))}
      </div>
      <UnsortedOffCard employees={todayOffByShift.off} date={today} />

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees} offEmployees={offEmployees} date={day.date} />
              ))}
            </div>
            <UnsortedOffCard employees={day.unsortedOff} date={day.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
