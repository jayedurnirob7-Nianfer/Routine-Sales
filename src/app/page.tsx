'use client';
import { useEffect, useState } from 'react';
import { getEmployees, getRoster, isOnLeave, getLeaveOnDate, SHIFT_INFO, todayKey, formatDate, get15Days, getNightShiftProgress, invalidateCache } from '@/lib/store';
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

  function uniqueEmps(emps: Employee[]) {
    const map = new Map<string, Employee>();
    emps.forEach(e => { if (e) map.set(e.id, e); });
    return Array.from(map.values());
  }

  function getShiftEmployees(shift: ShiftType, date: string = today): Employee[] {
    const emps = (roster[date] ?? [])
      .filter(a => a.shift === shift && !a.reason?.startsWith('LEAVE|'))
      .map(a => empMap[a.employeeId] || employees.find(e => e.employeeId === a.employeeId))
      .filter(emp => emp && !isOnLeave(roster, emp, date)) as Employee[];
    return uniqueEmps(emps);
  }

  function getOnLeaveEmployees(date: string = today): Employee[] {
    return uniqueEmps(employees.filter(emp => isOnLeave(roster, emp, date)));
  }

  function getOffTodayEmployees(date: string = today): Employee[] {
    const emps = (roster[date] ?? [])
      .filter(a => a.shift === 'off' && !a.reason?.startsWith('LEAVE|'))
      .map(a => empMap[a.employeeId] || employees.find(e => e.employeeId === a.employeeId))
      .filter(emp => emp && !isOnLeave(roster, emp, date)) as Employee[];
    return uniqueEmps(emps);
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

  // --- HELPER FUNCTION: DYNAMIC OFF DAY LABELS ---
  function getOffDayLabel(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    if (dateStr === today) return "Off Today";
    if (d > t) return "Upcoming Offday";
    return "Previous Offday";
  }

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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-red-500 font-medium">Could not connect to Google Sheets</p>
          <p className="text-gray-400 text-xs">{error}</p>
          <button onClick={() => load(true)} className="btn-primary text-sm">↻ Retry</button>
        </div>
      </div>
    );
  }

  const upcomingDays = getUpcomingDays();
  const todayOffByShift = getOffEmployeesByDefaultShift(today);

  function NightProgressPopover({ employee, date }: { employee: Employee; date: string }) {
    const progress = getNightShiftProgress(roster, employee, date);
    const displayLeave = getLeaveOnDate(roster, employee, date); 
    
    const rangeLabel = progress.totalNights === 0
      ? progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `${progress.rangeFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${progress.rangeTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return (
      <div className="absolute left-0 top-full mt-1 z-30 w-56 card p-3 shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" onClick={e => e.stopPropagation()}>
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

  // --- ENLARGED TABLET TEXT SIZES ---
  function EmployeeRow({ emp, muted = false, date, shiftType }: { emp: Employee; muted?: boolean; date: string; shiftType?: ShiftType }) {
    const isSelected = selectedEmp?.emp.id === emp.id && selectedEmp?.date === date;
    let progressBadge = null;
    if (shiftType === 'night' && !muted) {
      const prog = getNightShiftProgress(roster, emp, date);
      if (prog.totalNights > 0) {
        progressBadge = (
          <span className="ml-2 text-[10px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded">
            {prog.completedNights} / {prog.totalNights}
          </span>
        );
      }
    }
    return (
      <div className="relative flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-xl -mx-1 px-2 py-1.5"
        onClick={() => setSelectedEmp(isSelected ? null : { emp, date })}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-gray-100 dark:bg-gray-800 ${muted ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
          {emp.name.charAt(0)}
        </div>
        <div>
          <div className={`text-base font-medium flex items-center ${muted ? 'text-gray-400' : ''}`}>
            {emp.name}{progressBadge}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{emp.employeeId} · {emp.role}</div>
        </div>
        {isSelected && <NightProgressPopover employee={emp} date={date} />}
      </div>
    );
  }

  function ShiftCard({ shift, employees, offEmployees, onLeaveEmployees = [], date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; onLeaveEmployees?: Employee[]; date: string; }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible">
        {/* --- ENLARGED TABLET HEADERS --- */}
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-5 text-white rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold opacity-95 tracking-wide flex items-center gap-2">
                <span className="text-2xl">{shiftIcons[shift]}</span> {info.label} Shift
              </div>
              <div className="text-sm opacity-80 mt-1 font-medium">{info.time}</div>
            </div>
            <div className="text-5xl font-black opacity-95">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 space-y-1">
          {employees.length === 0 ? <p className="text-gray-400 text-sm">No one assigned</p> : <div className="space-y-1">{employees.map(emp => <EmployeeRow key={emp.id} emp={emp} date={date} shiftType={shift} />)}</div>}
          
          {/* --- DISTINCT OFF DAY GRADIENT CARD --- */}
          {offEmployees.length > 0 && (
            <div className="p-3 mt-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/20 border border-gray-100 dark:border-gray-700/50 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">🛌 {getOffDayLabel(date)}</div>
              {offEmployees.map(emp => <EmployeeRow key={emp.id} emp={emp} muted date={date} />)}
            </div>
          )}
          
          {/* --- DISTINCT LEAVE GRADIENT CARD --- */}
          {onLeaveEmployees.length > 0 && (
            <div className="p-3 mt-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border border-amber-100 dark:border-amber-900/30 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500 font-bold">✈️ On Leave</div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {employees.length > 0 && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/20 border border-gray-200 dark:border-gray-800/80">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold mb-3">🛌 {getOffDayLabel(date)} (No prior shift on record)</div>
            <div className="flex flex-col gap-1">
              {employees.map(emp => <div key={emp.id} className="relative"><EmployeeRow emp={emp} muted date={date} /></div>)}
            </div>
          </div>
        )}
        {onLeaveEmployees.length > 0 && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border border-amber-200 dark:border-amber-900/30">
            <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500 font-bold mb-3">✈️ On Leave (No prior shift on record)</div>
            <div className="flex flex-col gap-1">
              {onLeaveEmployees.map(emp => <div key={emp.id} className="relative"><EmployeeRow emp={emp} muted date={date} /></div>)}
            </div>
          </div>
        )}
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
