'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, getRoster, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress, invalidateCache, getAssignment } from '@/lib/store';
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

function Avatar({ emp, className = '' }: { emp: Employee, className?: string }) {
  if (emp.profileImage) {
    return <img src={emp.profileImage} alt={emp.name} className={`object-cover ${className}`} />;
  }
  return <div className={`flex items-center justify-center font-bold ${className}`}>{emp.name.charAt(0)}</div>;
}

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster]       = useState<RosterData>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
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

  useEffect(() => {
    function handleClickOutside() {
      setPopoverTarget(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    return (roster[date] ?? [])
      .filter(a => a.shift === shift)
      .map(a => empMap[a.employeeId])
      .filter(Boolean) as Employee[];
  }

  function prevDateKeyN(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d - n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  // ✅ Intelligently routes Off days by looking up to 7 days in the past
  function getOffEmployeesByPrevShift(date: string) {
    const offToday = getShiftEmployees('off', date);
    const grouped: Record<ShiftType, Employee[]> = { morning: [], evening: [], night: [], off: [] };
    const leave: Employee[] = [];
    const unsorted: Employee[] = [];

    offToday.forEach(emp => {
      const assignment = getAssignment(roster, emp, date);
      if (assignment?.reason?.startsWith('LEAVE|')) {
        leave.push(emp);
        return;
      }

      let prevShift: ShiftType | null = null;
      // Look back up to 7 days to find their last real working shift (skips leaves and off days!)
      for (let i = 1; i <= 7; i++) {
        const pastDate = prevDateKeyN(date, i);
        const pastAssignment = getAssignment(roster, emp, pastDate);
        if (pastAssignment && TODAY_SHIFTS.includes(pastAssignment.shift)) {
          prevShift = pastAssignment.shift;
          break;
        }
      }

      if (!prevShift) {
        prevShift = emp.defaultShift ?? 'morning';
      }

      if (TODAY_SHIFTS.includes(prevShift)) {
        grouped[prevShift].push(emp);
      } else {
        unsorted.push(emp);
      }
    });
    return { grouped, leave, unsorted };
  }

  const all15Days = get15Days(today);

  function getUpcomingDays() {
    const upcomingDates = all15Days.filter(date => date !== today);
    return upcomingDates.map(date => {
      const { grouped, leave, unsorted } = getOffEmployeesByPrevShift(date);
      return {
        date,
        shifts: TODAY_SHIFTS.map(shift => ({
          shift,
          employees: getShiftEmployees(shift, date),
          offEmployees: grouped[shift],
        })),
        leave,
        unsortedOff: unsorted,
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
  const todayData = getOffEmployeesByPrevShift(today);

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
        onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
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
          {progress.remaining > 0 && (
            <div className="ml-auto text-center">
              <div className="text-xl font-bold text-amber-500">{progress.remaining}</div>
              <div className="text-[10px] text-gray-400">Left</div>
            </div>
          )}
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
    const progress = shift === 'night' ? getNightShiftProgress(roster, emp, today) : null; 

    return (
      <div
        className={`relative flex items-center gap-2 cursor-pointer rounded-lg px-1 py-0.5 ${muted ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40 -mx-1'}`}
        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); togglePopover(emp.id, date, shift); }}>
        <div className={`w-7 h-7 rounded-full shrink-0 overflow-hidden shadow-sm border border-gray-200/50 dark:border-gray-700/50
          ${muted ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          <Avatar emp={emp} className="w-full h-full text-xs" />
        </div>
        <div>
          <div className={`text-sm font-medium flex items-center gap-2 ${muted ? 'text-gray-500 dark:text-gray-400' : ''}`}>
             {emp.name}
             {shift === 'night' && date === today && progress && progress.total > 0 && (
                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold dark:bg-purple-900/40 dark:text-purple-300">
                   {progress.completed}/{progress.total}
                </span>
             )}
          </div>
          <div className={`text-xs ${muted ? 'text-gray-400/80 dark:text-gray-500' : 'text-gray-400'}`}>{emp.employeeId} · {emp.role.split('|IMG:')[0]}</div>
        </div>
        {showPopover && <NightProgressPopover employee={emp} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; date: string }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible flex flex-col h-full">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-4 text-white rounded-t-2xl shrink-0`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium opacity-90">{shiftIcons[shift]} {info.label} Shift</div>
              <div className="text-xs opacity-75 mt-0.5">{info.time}</div>
            </div>
            <div className="text-3xl font-bold">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <div className="space-y-2 mb-4">
            {employees.length === 0 ? (
              <p className="text-gray-400 text-sm">No one assigned</p>
            ) : (
              employees.map(emp => <EmployeeRow key={emp.id} emp={emp} date={date} shift={shift} />)
            )}
          </div>

          {offEmployees.length > 0 && (
            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
                {date === today ? '🛌 Off Today' : '🛌 Off Day'}
              </div>
              {offEmployees.map(emp => (
                <div key={emp.id} className="bg-gray-50/80 dark:bg-gray-800/40 p-1.5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <EmployeeRow emp={emp} date={date} shift={shift} muted />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function OtherOffCard({ employees, date }: { employees: Employee[]; date: string }) {
    if (employees.length === 0) return null;
    return (
      <div className="card mt-4 overflow-hidden border-none shadow-sm bg-gray-50 dark:bg-gray-800/40">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-bold flex items-center gap-2">
              <span className="text-lg">🛌</span> Off Day (No Prior Shift)
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-gray-200 dark:border-gray-700 md:pl-4">
            {employees.map(emp => (
               <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                    <Avatar emp={emp} className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500" />
                 </div>
                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{emp.name}</span>
               </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function LeaveCard({ employees, date }: { employees: Employee[]; date: string }) {
    if (employees.length === 0) return null;
    return (
      <div className="card mt-4 overflow-hidden border-none shadow-sm bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
        <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-shrink-0">
            <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-500 font-bold flex items-center gap-2">
              <span className="text-lg">✈️</span> On Leave
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-4 border-l-0 md:border-l border-amber-200 dark:border-amber-900/50 md:pl-4">
            {employees.map(emp => {
               const assignment = getAssignment(roster, emp, date);
               const reason = assignment?.reason?.split('|')[3] || 'Leave';
               return (
                 <div key={emp.id} className="bg-white dark:bg-gray-900 pl-1 pr-3 py-1 rounded-lg shadow-sm border border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                   <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                      <Avatar emp={emp} className="w-full h-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-bold text-amber-600" />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{emp.name}</span>
                     <span className="text-[10px] text-amber-600 dark:text-amber-500">{reason}</span>
                   </div>
                 </div>
               );
            })}
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

      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TODAY_SHIFTS.map(shift => (
            <ShiftCard
              key={shift}
              shift={shift}
              employees={getShiftEmployees(shift)}
              offEmployees={todayData.grouped[shift]}
              date={today}
            />
          ))}
        </div>
        <LeaveCard employees={todayData.leave} date={today} />
        <OtherOffCard employees={todayData.unsorted} date={today} />
      </div>

      <div className="space-y-8 mt-12">
        <h2 className="text-lg font-semibold border-b border-gray-200 dark:border-gray-800 pb-2">Upcoming Shifts (Next 14 Days)</h2>

        {upcomingDays.map(day => (
          <div key={day.date} className="space-y-3 bg-gray-50/50 dark:bg-gray-900/20 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              📅 {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {day.shifts.map(({ shift, employees, offEmployees }) => (
                <ShiftCard key={`${day.date}-${shift}`} shift={shift} employees={employees} offEmployees={offEmployees} date={day.date} />
              ))}
            </div>
            <LeaveCard employees={day.leave} date={day.date} />
            <OtherOffCard employees={day.unsortedOff} date={day.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
